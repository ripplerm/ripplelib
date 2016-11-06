
'use strict';

var _Promise = require('babel-runtime/core-js/promise')['default'];

var _ = require('lodash');
var async = require('async');
var utils = require('./utils');
var parseTransaction = require('./parse/transaction');
var validate = utils.common.validate;
var errors = utils.common.errors;
var convertErrors = utils.common.convertErrors;
var RippleError = require('../../core/rippleerror').RippleError;

function attachTransactionDate(remote, tx, callback) {
  if (tx.date) {
    callback(null, tx);
    return;
  }
  if (!tx.ledger_index) {
    callback(new errors.NotFoundError('ledger_index not found in tx'));
    return;
  }

  remote.requestLedger(tx.ledger_index, function (error, data) {
    if (error) {
      callback(new errors.NotFoundError('Transaction ledger not found'));
    } else if (typeof data.ledger.close_time === 'number') {
      callback(null, _.assign({ date: data.ledger.close_time }, tx));
    } else {
      callback(new errors.ApiError('Ledger missing close_time'));
    }
  });
}

function isTransactionInRange(tx, options) {
  return (!options.minLedgerVersion || tx.ledger_index >= options.minLedgerVersion) && (!options.maxLedgerVersion || tx.ledger_index <= options.maxLedgerVersion);
}

function getTransactionAsync(identifier, options, callback) {
  validate.identifier(identifier);
  validate.getTransactionOptions(options);

  var remote = this.remote;
  var maxLedgerVersion = options.maxLedgerVersion || remote.getLedgerSequence();

  function callbackWrapper(error_, tx) {
    var error = error_;

    if (!error && tx && tx.validated !== true) {
      return callback(new errors.NotFoundError('Transaction not found'));
    }

    if (error instanceof RippleError && error.remote && error.remote.error === 'txnNotFound') {
      error = new errors.NotFoundError('Transaction not found');
    }

    // Missing complete ledger range
    if (error instanceof errors.NotFoundError && !utils.hasCompleteLedgerRange(remote, options.minLedgerVersion, maxLedgerVersion)) {
      if (utils.isPendingLedgerVersion(remote, maxLedgerVersion)) {
        callback(new errors.PendingLedgerVersionError());
      } else {
        callback(new errors.MissingLedgerHistoryError());
      }
      // Transaction is found, but not in specified range
    } else if (!error && tx && !isTransactionInRange(tx, options)) {
        callback(new errors.NotFoundError('Transaction not found'));
        // Transaction is not found
      } else if (error) {
          convertErrors(callback)(error);
        } else if (!tx) {
          callback(new errors.ApiError('Internal error'));
        } else {
          callback(error, parseTransaction(tx));
        }
  }

  async.waterfall([_.partial(remote.requestTx.bind(remote), { hash: identifier, binary: false }), _.partial(attachTransactionDate, remote)], callbackWrapper);
}

function getTransaction(identifier) {
  var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  return utils.promisify(getTransactionAsync).call(this, identifier, options);
}

module.exports = getTransaction;