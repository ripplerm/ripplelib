'use strict';

var util = require('util');
var assert = require('assert');
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var Transaction = require('./transaction').Transaction;
var RippleError = require('./rippleerror').RippleError;
var PendingQueue = require('./transactionqueue').TransactionQueue;
var log = require('./log').internal.sub('transactionmanager');
var Listener = require('./listener');

/**
 * @constructor TransactionManager
 * @param {Account} account
 */

function TransactionManager(account) {
  EventEmitter.call(this);

  var self = this;

  this._account = account;
  this._accountID = account._account_id;
  this._remote = account._remote;
  this._nextSequence = undefined;
  this._maxFee = this._remote.max_fee;
  this._maxAttempts = this._remote.max_attempts;
  this._lastLedgerOffset = this._remote.last_ledger_offset;
  this._pending = new PendingQueue();

  this._remote.on('load_changed', function (load) {
    self._adjustFees(load);
    self._handleLoadChanged();
  });

  function updatePendingStatus(ledger) {
    self._updatePendingStatus(ledger);
    self._lastClosedLedger = ledger.ledger_index;
    if (!self._pause_resubmit && self.getPending().getQueue().length) {
      self._resubmit();
    }
  }

  this._account._listener.on('transaction-outbound', function(res) {
    self._transactionReceived(res);
  });

  this._account._listener.on('reconnected', function (err) {
    self._loadSequence(); // reset nextSequence
    if (!err) self._resubmit(); // re-submit pending transactions
  });

  this._account._listener.on('ledger_closed', updatePendingStatus);

  // Query server for next account transaction sequence
  this._loadSequence();
}

util.inherits(TransactionManager, EventEmitter);

TransactionManager._isNoOp = function (transaction) {
  return typeof transaction === 'object' && typeof transaction.tx_json === 'object' && transaction.tx_json.TransactionType === 'AccountSet' && transaction.tx_json.Flags === 0;
};

TransactionManager._isRemoteError = function (error) {
  return typeof error === 'object' && error.error === 'remoteError' && typeof error.remote === 'object';
};

TransactionManager._isNotFound = function (error) {
  return TransactionManager._isRemoteError(error) && /^(txnNotFound|transactionNotFound)$/.test(error.remote.error);
};

TransactionManager._isTooBusy = function (error) {
  return TransactionManager._isRemoteError(error) && error.remote.error === 'tooBusy';
};

/**
 * Normalize transactions received from account transaction stream and
 * account_tx
 *
 * @param {Transaction}
 * @return {Transaction} normalized
 * @api private
 */

TransactionManager.normalizeTransaction = function(tx) {
  if (tx.normalized) return tx;
  return Listener.normalizeTransaction(tx);
};

/**
 * Handle received transaction from two possible sources
 *
 * + Account transaction stream (normal operation)
 * + account_tx (after reconnect)
 *
 * @param {Object} transaction
 * @api private
 */

TransactionManager.prototype._transactionReceived = function (tx) {
  var transaction = TransactionManager.normalizeTransaction(tx);

  if (!transaction.validated) {
    // Transaction has not been validated
    return;
  }

  if (transaction.tx_json.Account !== this._accountID) {
    // Received transaction's account does not match
    return;
  }

  if (this._remote.trace) {
    log.info('transaction received:', transaction.tx_json);
  }

  this._pending.addReceivedSequence(transaction.tx_json.Sequence);
  if (this._nextSequence <= transaction.tx_json.Sequence) this._nextSequence = transaction.tx_json.Sequence + 1;

  var hash = transaction.tx_json.hash;
  var submission = this._pending.getSubmission(hash);

  if (!(submission instanceof Transaction)) {
    // The received transaction does not correlate to one submitted
    this._pending.addReceivedId(hash, transaction);
    return;
  }

  // ND: A `success` handler will `finalize` this later
  switch (transaction.engine_result) {
    case 'tesSUCCESS':
      submission.emit('success', transaction);
      break;
    default:
      submission.emit('error', transaction);
  }
};

/**
 * Pause resubmissions during high load
 * resume when load decrease.
 *
 * @api private
 */

TransactionManager.prototype._handleLoadChanged = function() {
  var servers = this._remote._servers;
  var fees = [ ];

  for (var i=0; i<servers.length; i++) {
    var server = servers[i];
    if (server._connected) {
      var fee = 10 * (server._fee_base / server._fee_ref) * (server._load_factor / server._load_base);
      fees.push(Math.ceil(fee));
    }
  }
  if (fees.length == 0) return;

  if (Math.min.apply(null, fees) > this._maxFee) {
    this._pause_resubmit = true;
  } else {
    this._pause_resubmit = false;
  }
};

/**
 * Adjust pending transactions' fees in real-time. This does not resubmit
 * pending transactions; they will be resubmitted periodically with an updated
 * fee (and as a consequence, a new transaction ID) if not already validated
 *
 * ND: note, that `Fee` is a component of a transactionID
 *
 * @api private
 */

TransactionManager.prototype._adjustFees = function () {
  var self = this;

  if (!this._remote.local_fee) {
    return;
  }

  this._pending.forEach(function (transaction) {
    if (transaction._setFixedFee) {
      return;
    }

    var oldFee = transaction.tx_json.Fee;
    var newFee = transaction._computeFee();

    if (Number(newFee) > self._maxFee) newFee = String(self._maxFee);

    transaction.tx_json.Fee = newFee;
    transaction.emit('fee_adjusted', oldFee, newFee);

    if (self._remote.trace) {
      log.info('fee adjusted:', transaction.tx_json, oldFee, newFee);
    }
  });
};

/**
 * Get pending transactions
 *
 * @return {Array} pending transactions
 */

TransactionManager.prototype.getPending = function () {
  return this._pending;
};

/**
 * Legacy code. Update transaction status after excessive ledgers pass. 
 *
 * @param {Object} ledger data
 * @api private
 */

TransactionManager.prototype._updatePendingStatus = function (ledger) {
  assert.strictEqual(typeof ledger, 'object');
  assert.strictEqual(typeof ledger.ledger_index, 'number');

  var self = this;
  this._pending.forEach(function (transaction) {
    if (transaction.finalized) {
      return;
    }

    if (ledger.ledger_index > transaction.tx_json.LastLedgerSequence) {
      // Transaction must fail
      transaction.emit('error', new RippleError('tejMaxLedger', 'Transaction LastLedgerSequence exceeded'));

      // reset nextSequence
      if (transaction.tx_json.Sequence < self._nextSequence) self._loadSequence();
    }
  });
};

/**
 * Load account transaction sequence
 *
 * @param [Function] callback
 * @api private
 */

TransactionManager.prototype._loadSequence = function (callback_) {
  var self = this;
  var callback = typeof callback_ === 'function' ? callback_ : function () {};

  function sequenceLoaded(err, sequence) {
    if (err || typeof sequence !== 'number') {
      if (self._remote.trace) {
        log.info('error requesting account transaction sequence', err);
        return;
      }
    }

    self._nextSequence = sequence;
    self.emit('sequence_loaded', sequence);
    callback(err, sequence);
  }

  this._account.getNextSequence(sequenceLoaded);
};

/**
 * Resubmit pending transactions. If a transaction is specified, it will be
 * resubmitted. Otherwise, all pending transactions will be resubmitted
 *
 * @param [Number] ledgers to wait before resubmitting
 * @param [Transaction] pending transactions to resubmit
 * @api private
 */

TransactionManager.prototype._resubmit = function (pending) {
  var self = this;
  pending = pending instanceof Transaction ? [pending] : this.getPending().getQueue();

  function resubmitTransaction(transaction, next) {
    if (!transaction || transaction.finalized) {
      // Transaction has been finalized, nothing to do
      return next();
    }

    if (self._lastClosedLedger <= transaction.submitIndex + 1) {
      return next(true); // wait until ledger_closed > submitindex + 1
    }

    // Find ID within cache of received (validated) transaction IDs
    var received = transaction.findId(self._pending._idCache);

    if (received) {
      switch (received.engine_result) {
        case 'tesSUCCESS':
          transaction.emit('success', received);
          break;
        default:
          transaction.emit('error', received);
      }
      return next();
    }

    if (self._remote.trace) {
      log.info('resubmit:', transaction.tx_json);
    }

    transaction.once('submitted', function (m) {
      transaction.emit('resubmitted', m);
      switch (m.result.slice(0, 3)) {
        case 'tes':
        case 'tec':
          next();
          break;
        default:
          if (m.result === 'tefALREADY' || m.result === 'tefPAST_SEQ') next();
          else next(true); //break the submission series.  
      }
    });

    self._request(transaction);
  }

  async.eachSeries(pending, resubmitTransaction);
};

/**
 * Prepare submit request
 *
 * @param {Transaction} transaction to submit
 * @return {Request} submit request
 * @api private
 */

TransactionManager.prototype._prepareRequest = function (tx) {
  var submitRequest = this._remote.requestSubmit();

  if (this._remote.local_signing) {
    tx.sign();

    var serialized = tx.serialize();
    submitRequest.tx_blob(serialized.to_hex());

    var hash = tx.hash(null, null, serialized);
    tx.addId(hash);
  } else {
    // ND: `build_path` is completely ignored when doing local signing as
    // `Paths` is a component of the signed blob, the `tx_blob` is signed,
    // sealed and delivered, and the txn unmodified.
    // TODO: perhaps an exception should be raised if build_path is attempted
    // while local signing
    submitRequest.build_path(tx._build_path);
    submitRequest.secret(tx._secret);
    submitRequest.tx_json(tx.tx_json);
  }

  return submitRequest;
};

/**
 * Send `submit` request, handle response
 *
 * @param {Transaction} transaction to submit
 * @api private
 */

TransactionManager.prototype._request = function (tx) {
  var self = this;
  var remote = this._remote;

  if (tx.finalized) {
    return;
  }

  if (tx.attempts > this._maxAttempts) {
    tx.emit('error', new RippleError('tejAttemptsExceeded'));
    return;
  }

  if (tx.attempts > 0 && !remote.local_signing) {
    var errMessage = 'Automatic resubmission requires local signing';
    tx.emit('error', new RippleError('tejLocalSigningRequired', errMessage));
    return;
  }

  if (remote.trace) {
    log.info('submit transaction:', tx.tx_json);
  }

  function submissionError(error) {
    if (TransactionManager._isTooBusy(error)) {
      // do nothing;
    } else {
      tx.emit('error', error);
      self._loadSequence(); // reset nextSequence;
    }
  }

  function submitted(message) {
    if (tx.finalized) {
      return;
    }

    // ND: If for some unknown reason our hash wasn't computed correctly this
    // is an extra measure.
    if (message.tx_json && message.tx_json.hash) {
      tx.addId(message.tx_json.hash);
    }

    message.result = message.engine_result || '';

    tx.result = message;
    tx.responses += 1;

    if (remote.trace) {
      log.info('submit response:', message);
    }

    tx.emit('submitted', message);

    switch (message.result.slice(0, 3)) {
      case 'tes':
      case 'tec':
        tx.emit('proposed', message);
        break;
      case 'ter':
      case 'tef':
      case 'tel':
        // do nothing;
        break;
      case 'tem':  
      default:
        submissionError(message);
    }
  }

  tx.submitIndex = this._remote._ledger_current_index;

  if (tx.attempts === 0) {
    tx.initialSubmitIndex = tx.submitIndex;
  }

  if (!tx._setLastLedger) {
    // Honor LastLedgerSequence set with tx.lastLedger()
    tx.tx_json.LastLedgerSequence = tx.initialSubmitIndex + this._lastLedgerOffset;
  }

  tx.lastLedgerSequence = tx.tx_json.LastLedgerSequence;

  if (remote.local_signing) {
    tx.sign();
  }

  var submitRequest = this._prepareRequest(tx);
  submitRequest.once('error', submitted);
  submitRequest.once('success', submitted);

  tx.emit('presubmit');

  var filterFn = function (res) {
    if (! res.engine_result) return false;
    var result = res.engine_result.slice(3);
    return result == 'tes' || result == 'tec';
  }
  submitRequest.broadcast(filterFn).request();
  tx.attempts++;

  tx.emit('postsubmit');
};

/**
 * Entry point for TransactionManager submission
 *
 * @param {Transaction} tx
 */

TransactionManager.prototype.submit = function (tx) {
  var self = this;

  if (typeof this._nextSequence !== 'number') {
    // If sequence number is not yet known, defer until it is.
    this.once('sequence_loaded', function () {
      self.submit(tx);
    });
    return;
  }

  if (tx.finalized) {
    // Finalized transactions must stop all activity
    return;
  }

  if (typeof tx.tx_json.Sequence !== 'number') {
    // Honor manually-set sequences
    tx.tx_json.Sequence = this._nextSequence++;
    tx._seqAutofilled = true;
  }

  tx.once('cleanup', function () {
    self.getPending().remove(tx);
  });

  if (!tx.complete()) {
    if (tx._seqAutofilled) this._nextSequence--;
    return;
  }

  // ND: this is the ONLY place we put the tx into the queue. The
  // TransactionQueue queue is merely a list, so any mutations to tx._hash
  // will cause subsequent look ups (eg. inside 'transaction-outbound'
  // validated transaction clearing) to fail.
  this._pending.push(tx);
  this._request(tx);
};

exports.TransactionManager = TransactionManager;