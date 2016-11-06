
'use strict';
var _ = require('lodash');
var transactionParser = require('ripple-lib-transactionparser');
var toTimestamp = require('../../../core/utils').toTimestamp;
var utils = require('../utils');
var BigNumber = require('bignumber.js');

function adjustQualityForXRP(quality, takerGetsCurrency, takerPaysCurrency) {
  // quality = takerPays.value/takerGets.value
  // using drops (1e-6 XRP) for XRP values
  var numeratorShift = takerPaysCurrency === 'XRP' ? -6 : 0;
  var denominatorShift = takerGetsCurrency === 'XRP' ? -6 : 0;
  var shift = numeratorShift - denominatorShift;
  return shift === 0 ? quality : new BigNumber(quality).shift(shift).toString();
}

function parseTimestamp(tx) {
  return tx.date ? new Date(toTimestamp(tx.date)).toISOString() : undefined;
}

function removeUndefined(obj) {
  return _.omit(obj, _.isUndefined);
}

function removeEmptyCounterparty(amount) {
  if (amount.counterparty === '') {
    delete amount.counterparty;
  }
}

function removeEmptyCounterpartyInBalanceChanges(balanceChanges) {
  _.forEach(balanceChanges, function (changes) {
    _.forEach(changes, removeEmptyCounterparty);
  });
}

function removeEmptyCounterpartyInOrderbookChanges(orderbookChanges) {
  _.forEach(orderbookChanges, function (changes) {
    _.forEach(changes, function (change) {
      _.forEach(change, removeEmptyCounterparty);
    });
  });
}

function parseOutcome(tx) {
  if (!tx.validated) {
    return undefined;
  }

  var balanceChanges = transactionParser.parseBalanceChanges(tx.meta);
  var orderbookChanges = transactionParser.parseOrderbookChanges(tx.meta);
  removeEmptyCounterpartyInBalanceChanges(balanceChanges);
  removeEmptyCounterpartyInOrderbookChanges(orderbookChanges);

  return {
    result: tx.meta.TransactionResult,
    timestamp: parseTimestamp(tx),
    fee: utils.common.dropsToXrp(tx.Fee),
    balanceChanges: balanceChanges,
    orderbookChanges: orderbookChanges,
    ledgerVersion: tx.ledger_index,
    indexInLedger: tx.meta.TransactionIndex
  };
}

function parseMemos(tx) {
  if (!Array.isArray(tx.Memos) || tx.Memos.length === 0) {
    return undefined;
  }
  return tx.Memos.map(function (m) {
    return removeUndefined({
      type: m.Memo.parsed_memo_type,
      format: m.Memo.parsed_memo_format,
      data: m.Memo.parsed_memo_data
    });
  });
}

module.exports = {
  parseOutcome: parseOutcome,
  parseMemos: parseMemos,
  removeUndefined: removeUndefined,
  adjustQualityForXRP: adjustQualityForXRP,
  dropsToXrp: utils.common.dropsToXrp,
  constants: utils.common.constants,
  core: utils.common.core
};