
'use strict';
var _ = require('lodash');
var assert = require('assert');
var utils = require('./utils');
var parseAmount = require('./amount');

function removeGenericCounterparty(amount, address) {
  return amount.counterparty === address ? _.omit(amount, 'counterparty') : amount;
}

function parseSuspendedPaymentCreation(tx) {
  assert(tx.TransactionType === 'SuspendedPaymentCreate');

  var source = {
    address: tx.Account,
    maxAmount: removeGenericCounterparty(parseAmount(tx.SendMax || tx.Amount), tx.Account),
    tag: tx.SourceTag
  };

  var destination = {
    address: tx.Destination,
    amount: removeGenericCounterparty(parseAmount(tx.Amount), tx.Destination),
    tag: tx.DestinationTag
  };

  return utils.removeUndefined({
    source: utils.removeUndefined(source),
    destination: utils.removeUndefined(destination),
    memos: utils.parseMemos(tx),
    digest: tx.Digest,
    allowCancelAfter: tx.CancelAfter,
    allowExecuteAfter: tx.FinishAfter
  });
}

module.exports = parseSuspendedPaymentCreation;