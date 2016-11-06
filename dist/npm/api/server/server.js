

// If a ledger is not received in this time, consider the connection offline

'use strict';

var _Promise = require('babel-runtime/core-js/promise')['default'];

var _ = require('lodash');
var common = require('../common');
var CONNECTION_TIMEOUT = 1000 * 30;

function isUpToDate(remote) {
  var server = remote.getServer();
  return Boolean(server) && (remote._stand_alone || Date.now() - server._lastLedgerClose <= CONNECTION_TIMEOUT);
}

function isConnected() {
  return Boolean(this.remote._ledger_current_index) && isUpToDate(this.remote);
}

function getServerInfoAsync(callback) {
  this.remote.requestServerInfo(function (error, response) {
    if (error) {
      var message = _.get(error, ['remote', 'error_message'], error.message);
      callback(new common.errors.RippledNetworkError(message));
    } else {
      callback(null, common.convertKeysFromSnakeCaseToCamelCase(response.info));
    }
  });
}

function getFee() {
  return common.dropsToXrp(this.remote.createTransaction()._computeFee());
}

function getLedgerVersion() {
  return this.remote.getLedgerSequence();
}

function connect() {
  var _this = this;

  return common.promisify(function (callback) {
    _this.remote.connect(function () {
      return callback(null);
    });
  })();
}

function disconnect() {
  var _this2 = this;

  return common.promisify(function (callback) {
    _this2.remote.disconnect(function () {
      return callback(null);
    });
  })();
}

function getServerInfo() {
  return common.promisify(getServerInfoAsync.bind(this))();
}

function rippleTimeToISO8601(rippleTime) {
  return new Date(common.core.utils.toTimestamp(rippleTime)).toISOString();
}

function formatLedgerClose(ledgerClose) {
  return {
    feeBase: ledgerClose.fee_base,
    feeReference: ledgerClose.fee_ref,
    ledgerHash: ledgerClose.ledger_hash,
    ledgerVersion: ledgerClose.ledger_index,
    ledgerTimestamp: rippleTimeToISO8601(ledgerClose.ledger_time),
    reserveBase: ledgerClose.reserve_base,
    reserveIncrement: ledgerClose.reserve_inc,
    transactionCount: ledgerClose.txn_count,
    validatedLedgerVersions: ledgerClose.validated_ledgers
  };
}

module.exports = {
  connect: connect,
  disconnect: disconnect,
  isConnected: isConnected,
  getServerInfo: getServerInfo,
  getFee: getFee,
  getLedgerVersion: getLedgerVersion,
  formatLedgerClose: formatLedgerClose
};