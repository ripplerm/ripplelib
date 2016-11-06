'use strict';
// Routines for working with an account.
//
// You should not instantiate this class yourself, instead use Remote#account.
//
// Events:
//   wallet_clean :  True, iff the wallet has been updated.
//   wallet_dirty :  True, iff the wallet needs to be updated.
//   balance:        The current stamp balance.
//   balance_proposed
//

var _ = require('lodash');
var async = require('async');
var extend = require('extend');
var util = require('util');

var _require = require('ripple-keypairs');

var deriveAddress = _require.deriveAddress;

var _require2 = require('events');

var EventEmitter = _require2.EventEmitter;

var _require3 = require('./transactionmanager');

var TransactionManager = _require3.TransactionManager;

var _require4 = require('./uint160');

var UInt160 = _require4.UInt160;

/**
 * @constructor Account
 * @param {Remote} remote
 * @param {String} account
 */

function Account(remote, account) {
  EventEmitter.call(this);

  var self = this;

  this._remote = remote;
  this._account = UInt160.from_json(account);
  this._account_id = this._account.to_json();
  this._subs = 0;

  // Ledger entry object
  // Important: This must never be overwritten, only extend()-ed
  this._entry = {};

  function listenerAdded(type) {
    if (_.includes(Account.subscribeEvents, type)) {
      if (!self._subs && self._remote._connected) {
        self._remote.requestSubscribe().addAccount(self._account_id).broadcast().request();
      }
      self._subs += 1;
    }
  }

  this.on('newListener', listenerAdded);

  function listenerRemoved(type) {
    if (_.includes(Account.subscribeEvents, type)) {
      self._subs -= 1;
      if (!self._subs && self._remote._connected) {
        self._remote.requestUnsubscribe().addAccount(self._account_id).broadcast().request();
      }
    }
  }

  this.on('removeListener', listenerRemoved);

  function attachAccount(request) {
    if (self._account.is_valid() && self._subs) {
      request.addAccount(self._account_id);
    }
  }

  this._remote.on('prepare_subscribe', attachAccount);

  function handleTransaction(transaction) {
    if (!transaction.mmeta) {
      return;
    }

    var changed = false;

    transaction.mmeta.each(function (an) {
      var isAccount = an.fields.Account === self._account_id;
      var isAccountRoot = isAccount && an.entryType === 'AccountRoot';

      if (isAccountRoot) {
        extend(self._entry, an.fieldsNew, an.fieldsFinal);
        changed = true;
      }
    });

    if (changed) {
      self.emit('entry', self._entry);
    }
  }

  this.on('transaction', handleTransaction);

  this._transactionManager = new TransactionManager(this);

  return this;
}

util.inherits(Account, EventEmitter);

/**
 * List of events that require a remote subscription to the account.
 */

Account.subscribeEvents = ['transaction', 'entry'];

Account.prototype.toJson = function () {
  return this._account.to_json();
};

/**
 * Whether the AccountId is valid.
 *
 * Note: This does not tell you whether the account exists in the ledger.
 */

Account.prototype.isValid = function () {
  return this._account.is_valid();
};

/**
 * Request account info
 *
 * @param {Function} callback
 */

Account.prototype.getInfo = function (callback) {
  return this._remote.requestAccountInfo({ account: this._account_id }, callback);
};

/**
 * Retrieve the current AccountRoot entry.
 *
 * To keep up-to-date with changes to the AccountRoot entry, subscribe to the
 * 'entry' event.
 *
 * @param {Function} callback
 */

Account.prototype.entry = function (callback_) {
  var self = this;
  var callback = typeof callback_ === 'function' ? callback_ : _.noop;

  function accountInfo(err, info) {
    if (err) {
      callback(err);
    } else {
      extend(self._entry, info.account_data);
      self.emit('entry', self._entry);
      callback(null, info);
    }
  }

  this.getInfo(accountInfo);

  return this;
};

Account.prototype.getNextSequence = function (callback_) {
  var callback = typeof callback_ === 'function' ? callback_ : _.noop;

  function isNotFound(err) {
    return err && typeof err === 'object' && typeof err.remote === 'object' && err.remote.error === 'actNotFound';
  }

  function accountInfo(err, info) {
    if (isNotFound(err)) {
      // New accounts will start out as sequence one
      callback(null, 1);
    } else if (err) {
      callback(err);
    } else {
      callback(null, info.account_data.Sequence);
    }
  }

  this.getInfo(accountInfo);

  return this;
};

/**
 * Retrieve this account's Ripple trust lines.
 *
 * To keep up-to-date with changes to the AccountRoot entry, subscribe to the
 * 'lines' event. (Not yet implemented.)
 *
 * @param {function(err, lines)} callback Called with the result
 */

Account.prototype.lines = function (callback_) {
  var self = this;
  var callback = typeof callback_ === 'function' ? callback_ : _.noop;

  function accountLines(err, res) {
    if (err) {
      callback(err);
    } else {
      self._lines = res.lines;
      self.emit('lines', self._lines);
      callback(null, res);
    }
  }

  this._remote.requestAccountLines({ account: this._account_id }, accountLines);

  return this;
};

/**
 * Retrieve this account's single trust line.
 *
 * @param {string} currency Currency
 * @param {string} address Ripple address
 * @param {function(err, line)} callback Called with the result
 * @returns {Account}
 */

Account.prototype.line = function (currency, address, callback_) {
  var self = this;
  var callback = typeof callback_ === 'function' ? callback_ : _.noop;

  self.lines(function (err, data) {
    if (err) {
      return callback(err);
    }

    var line = undefined;

    for (var i = 0; i < data.lines.length; i++) {
      var l = data.lines[i];
      if (l.account === address && l.currency === currency) {
        line = l;
        break;
      }
    }

    callback(null, line);
  });

  return this;
};

/**
 * Notify object of a relevant transaction.
 *
 * This is only meant to be called by the Remote class. You should never have to
 * call this yourself.
 *
 * @param {Object} message
 */

Account.prototype.notify = Account.prototype.notifyTx = function (transaction) {
  // Only trigger the event if the account object is actually
  // subscribed - this prevents some weird phantom events from
  // occurring.
  if (!this._subs) {
    return;
  }

  this.emit('transaction', transaction);

  var account = transaction.transaction.Account;

  if (!account) {
    return;
  }

  var isThisAccount = account === this._account_id;

  this.emit(isThisAccount ? 'transaction-outbound' : 'transaction-inbound', transaction);
};

/**
 * Submit a transaction to an account's
 * transaction manager
 *
 * @param {Transaction} transaction
 */

Account.prototype.submit = function (transaction) {
  this._transactionManager.submit(transaction);
};

/**
 *  Check whether the given public key is valid for this account
 *
 *  @param {Hex-encoded_String|RippleAddress} public_key Public key
 *  @param {Function} callback Is a callback
 *  @returns {void}
 *
 *  @callback
 *  param {Error} err
 *  param {Boolean} true if the public key is valid and active, false otherwise
 */
Account.prototype.publicKeyIsActive = function (public_key, callback) {
  var self = this;
  var public_key_as_uint160 = undefined;

  try {
    public_key_as_uint160 = Account._publicKeyToAddress(public_key);
  } catch (err) {
    return callback(err);
  }

  function getAccountInfo(async_callback) {
    self.getInfo(function (err, account_info_res) {

      // If the remote responds with an Account Not Found error then the account
      // is unfunded and thus we can assume that the master key is active
      if (err && err.remote && err.remote.error === 'actNotFound') {
        async_callback(null, null);
      } else {
        async_callback(err, account_info_res);
      }
    });
  }

  function publicKeyIsValid(account_info_res, async_callback) {
    // Catch the case of unfunded accounts
    if (!account_info_res) {

      if (public_key_as_uint160 === self._account_id) {
        async_callback(null, true);
      } else {
        async_callback(null, false);
      }

      return;
    }

    var account_info = account_info_res.account_data;

    // Respond with true if the RegularKey is set and matches the given
    // public key or if the public key matches the account address and
    // the lsfDisableMaster is not set
    if (account_info.RegularKey && account_info.RegularKey === public_key_as_uint160) {
      async_callback(null, true);
    } else if (account_info.Account === public_key_as_uint160 && (account_info.Flags & 0x00100000) === 0) {
      async_callback(null, true);
    } else {
      async_callback(null, false);
    }
  }

  var steps = [getAccountInfo, publicKeyIsValid];

  async.waterfall(steps, callback);
};

/**
 *  Convert a hex-encoded public key to a Ripple Address
 *
 *  @static
 *
 *  @param {Hex-encoded_string|RippleAddress} public_key Public key
 *  @returns {RippleAddress} Ripple Address
 */
Account._publicKeyToAddress = function (public_key) {
  // Based on functions in /src/js/ripple/keypair.js
  function hexToUInt160(publicKey) {
    return deriveAddress(publicKey);
  }

  if (UInt160.is_valid(public_key)) {
    return public_key;
  } else if (/^[0-9a-fA-F]+$/.test(public_key)) {
    return hexToUInt160(public_key);
  } else {
    // eslint-disable-line no-else-return
    throw new Error('Public key is invalid. Must be a UInt160 or a hex string');
  }
};

exports.Account = Account;

// vim:sw=2:sts=2:ts=8:et