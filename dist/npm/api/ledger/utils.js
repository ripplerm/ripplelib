
'use strict';
var _ = require('lodash');
var assert = require('assert');
var common = require('../common');
var dropsToXrp = common.dropsToXrp;
var composeAsync = common.composeAsync;

function clamp(value, min, max) {
  assert(min <= max, 'Illegal clamp bounds');
  return Math.min(Math.max(value, min), max);
}

function getXRPBalance(remote, address, ledgerVersion, callback) {
  remote.requestAccountInfo({ account: address, ledger: ledgerVersion }, composeAsync(function (data) {
    return dropsToXrp(data.account_data.Balance);
  }, callback));
}

// If the marker is omitted from a response, you have reached the end
// getter(marker, limit, callback), callback(error, {marker, results})
function getRecursiveRecur(getter, marker, limit, callback) {
  getter(marker, limit, function (error, data) {
    if (error) {
      return callback(error);
    }
    var remaining = limit - data.results.length;
    if (remaining > 0 && data.marker !== undefined) {
      getRecursiveRecur(getter, data.marker, remaining, function (_error, results) {
        return _error ? callback(_error) : callback(null, data.results.concat(results));
      });
    } else {
      return callback(null, data.results.slice(0, limit));
    }
  });
}

function getRecursive(getter, limit, callback) {
  getRecursiveRecur(getter, undefined, limit || Infinity, callback);
}

function renameCounterpartyToIssuer(amount) {
  if (amount === undefined) {
    return undefined;
  }
  var issuer = amount.counterparty === undefined ? amount.issuer : amount.counterparty;
  var withIssuer = _.assign({}, amount, { issuer: issuer });
  return _.omit(withIssuer, 'counterparty');
}

function renameCounterpartyToIssuerInOrder(order) {
  var taker_gets = renameCounterpartyToIssuer(order.taker_gets);
  var taker_pays = renameCounterpartyToIssuer(order.taker_pays);
  var changes = { taker_gets: taker_gets, taker_pays: taker_pays };
  return _.assign({}, order, _.omit(changes, _.isUndefined));
}

function signum(num) {
  return num === 0 ? 0 : num > 0 ? 1 : -1;
}

/**
 *  Order two rippled transactions based on their ledger_index.
 *  If two transactions took place in the same ledger, sort
 *  them based on TransactionIndex
 *  See: https://ripple.com/build/transactions/
 *
 *  @param {Object} first
 *  @param {Object} second
 *  @returns {Number} [-1, 0, 1]
 */

function compareTransactions(first, second) {
  if (!first.outcome || !second.outcome) {
    return 0;
  }
  if (first.outcome.ledgerVersion === second.outcome.ledgerVersion) {
    return signum(first.outcome.indexInLedger - second.outcome.indexInLedger);
  }
  return first.outcome.ledgerVersion < second.outcome.ledgerVersion ? -1 : 1;
}

function hasCompleteLedgerRange(remote, minLedgerVersion, maxLedgerVersion) {

  var firstLedgerVersion = 32570; // earlier versions have been lost
  return remote.getServer().hasLedgerRange(minLedgerVersion || firstLedgerVersion, maxLedgerVersion || remote.getLedgerSequence());
}

function isPendingLedgerVersion(remote, maxLedgerVersion) {
  var currentLedger = remote.getLedgerSequence();
  return currentLedger < (maxLedgerVersion || 0);
}

module.exports = {
  getXRPBalance: getXRPBalance,
  compareTransactions: compareTransactions,
  renameCounterpartyToIssuer: renameCounterpartyToIssuer,
  renameCounterpartyToIssuerInOrder: renameCounterpartyToIssuerInOrder,
  getRecursive: getRecursive,
  hasCompleteLedgerRange: hasCompleteLedgerRange,
  isPendingLedgerVersion: isPendingLedgerVersion,
  promisify: common.promisify,
  clamp: clamp,
  common: common
};