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

// var network = require('./network.js');
'use strict';

var async = require('async');
var util = require('util');
var extend = require('extend');
var EventEmitter = require('events').EventEmitter;
var Amount = require('./amount').Amount;
var UInt160 = require('./uint160').UInt160;
var TransactionManager = require('./transactionmanager').TransactionManager;
var sjcl = require('./utils').sjcl;
var Base = require('./base').Base;
var Listener = require('./listener');

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

  function listenerAdded(type, listener) {
    if (~Account.subscribeEvents.indexOf(type)) {
      if (!self._subs && self._remote._connected) {
        self._remote.request_subscribe().add_account(self._account_id).broadcast().request();
      }
      self._subs += 1;
    }
  };

  this.on('newListener', listenerAdded);

  function listenerRemoved(type, listener) {
    if (~Account.subscribeEvents.indexOf(type)) {
      self._subs -= 1;
      if (!self._subs && self._remote._connected) {
        self._remote.request_unsubscribe().add_account(self._account_id).broadcast().request();
      }
    }
  };

  this.on('removeListener', listenerRemoved);

  function attachAccount(request) {
    if (self._account.is_valid() && self._subs) {
      request.add_account(self._account_id);
    }
  };

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
        Object.keys(an.fieldsPrev).forEach(function(field){
          if (!an.fieldsFinal.hasOwnProperty(field)) delete self._entry[field];
        })
        changed = true;
      }

      if (an.entryType === 'SignerList') {
        switch (an.nodeType) {
          case 'CreatedNode':
          case 'ModifiedNode':
            if (!(self._entry.signer_lists && self._entry.signer_lists[0])) self._entry.signer_lists = [{}];
            extend(self._entry.signer_lists[0], an.fieldsNew, an.fieldsFinal);
            break;
          case 'DeletedNode':
            self._entry.signer_lists = [];
            break;
        }
        changed = true;
      }
    });

    if (changed) {
      self.emit('entry', self._entry, transaction.ledger_index);
    }
  };

  this.on('transaction', handleTransaction);

  this._listener = new Listener(this);
  this._transactionManager = new TransactionManager(this);

  return this;
};

util.inherits(Account, EventEmitter);

/**
 * List of events that require a remote subscription to the account.
 */

Account.subscribeEvents = ['transaction', 'entry'];

Account.prototype.getStream = function () {
  return this._listener;
};

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
  return this._remote.requestAccountInfo({account: this._account_id, signer_lists: true, ledger:'validated'}, callback);
};

/**
 * Retrieve the current AccountRoot entry.
 *
 * To keep up-to-date with changes to the AccountRoot entry, subscribe to the
 * 'entry' event.
 *
 * @param {Function} callback
 */

Account.prototype.entry = function (callback) {
  var self = this;
  var callback = typeof callback === 'function' ? callback : function () {};

  function accountInfo(err, info) {
    if (err) {
      callback(err);
    } else {
      self._entry = extend({}, info.account_data);
      self.emit('entry', self._entry, info.ledger_index);
      callback(null, info);
    }
  };

  this.getInfo(accountInfo);

  return this;
};

Account.prototype.getNextSequence = function (callback) {
  var callback = typeof callback === 'function' ? callback : function () {};

  function isNotFound(err) {
    return err && typeof err === 'object' && typeof err.remote === 'object' && err.remote.error === 'actNotFound';
  };

  function accountInfo(err, info) {
    if (isNotFound(err)) {
      // New accounts will start out as sequence one
      callback(null, 1);
    } else if (err) {
      callback(err);
    } else {
      callback(null, info.account_data.Sequence);
    }
  };

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

Account.prototype.lines = function (callback) {
  var self = this;
  var callback = typeof callback === 'function' ? callback : function () {};

  function accountLines(err, res) {
    if (err) {
      callback(err);
    } else {
      res.lines = Lines;
      self._lines = res.lines;
      self.emit('lines', self._lines);
      callback(null, res);
    }
  }

  var Count = 0;
  var Lines = [];
  var opts = {
    account: this._account_id,
    ledger: 'validated'
  }

  this._remote.requestAccountLines(opts, function handle_lines (err, res) {
    if (err) return accountLines(err);
    Lines = Lines.concat(res.lines);
    var marker = res.marker;
    if (marker) {
      self.emit('lines_marker', marker, ++Count);
      opts.marker = marker;
      opts.ledger = res.ledger_index;
      self._remote.requestAccountLines(opts, handle_lines);
    } else {
      accountLines(null, res);
    }
  });

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

Account.prototype.line = function (currency, address, callback) {
  var self = this;
  var callback = typeof callback === 'function' ? callback : function () {};

  this._remote.requestRippleBalance({
    account: this._account_id,
    issuer: address,
    currency: currency,
    ledger: 'validated'     
  }, function (err, res) {
    if (err) return callback(err);
    var line = {
        account: address,
        currency: currency,
        balance: res.account_balance.to_text(),
        limit: res.account_limit.to_text(),
        limit_peer: res.peer_limit.to_text(),
        quality_in: res.account_quality_in,
        quality_out: res.account_quality_out,
        no_ripple: res.account_no_ripple,
        no_ripple_peer: res.peer_no_ripple,
        freeze: res.account_freeze,
        freeze_peer: res.peer_freeze,
        authorized: res.account_authorized,
        peer_authorized: res.peer_authorized,
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
 *  @param {Hex-encoded String|RippleAddress} public_key
 *  @param {Function} callback
 *
 *  @callback
 *  @param {Error} err
 *  @param {Boolean} true if the public key is valid and active, false otherwise
 */
Account.prototype.publicKeyIsActive = function (public_key, callback) {
  var self = this;
  var public_key_as_uint160;

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
  };

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

    // Respond with true if the RegularKey is set and matches the given public key or
    // if the public key matches the account address and the lsfDisableMaster is not set
    if (account_info.RegularKey && account_info.RegularKey === public_key_as_uint160) {
      async_callback(null, true);
    } else if (account_info.Account === public_key_as_uint160 && (account_info.Flags & 0x00100000) === 0) {
      async_callback(null, true);
    } else {
      async_callback(null, false);
    }
  };

  var steps = [getAccountInfo, publicKeyIsValid];

  async.waterfall(steps, callback);
};

/**
 *  Convert a hex-encoded public key to a Ripple Address
 *
 *  @static
 *
 *  @param {Hex-encoded string|RippleAddress} public_key
 *  @returns {RippleAddress}
 */
Account._publicKeyToAddress = function (public_key) {
  // Based on functions in /src/js/ripple/keypair.js
  function hexToUInt160(public_key) {
    var bits = sjcl.codec.hex.toBits(public_key);
    var hash = sjcl.hash.ripemd160.hash(sjcl.hash.sha256.hash(bits));
    var address = UInt160.from_bits(hash);
    address.set_version(Base.VER_ACCOUNT_ID);

    return address.to_json();
  };

  if (UInt160.is_valid(public_key)) {
    return public_key;
  } else if (/^[0-9a-fA-F]+$/.test(public_key)) {
    return hexToUInt160(public_key);
  } else {
    throw new Error('Public key is invalid. Must be a UInt160 or a hex string');
  }
};

exports.Account = Account;

// vim:sw=2:sts=2:ts=8:et