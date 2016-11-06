
'use strict';
var assert = require('assert');
var utils = require('./utils');
var parsePayment = require('./payment');
var parseTrustline = require('./trustline');
var parseOrder = require('./order');
var parseOrderCancellation = require('./cancellation');
var parseSettings = require('./settings');
var parseSuspendedPaymentCreation = require('./suspended-payment-creation');
var parseSuspendedPaymentExecution = require('./suspended-payment-execution');
var parseSuspendedPaymentCancellation = require('./suspended-payment-cancellation');

function parseTransactionType(type) {
  var mapping = {
    Payment: 'payment',
    TrustSet: 'trustline',
    OfferCreate: 'order',
    OfferCancel: 'orderCancellation',
    AccountSet: 'settings',
    SetRegularKey: 'settings',
    SuspendedPaymentCreate: 'suspendedPaymentCreation',
    SuspendedPaymentFinish: 'suspendedPaymentExecution',
    SuspendedPaymentCancel: 'suspendedPaymentCancellation'
  };
  return mapping[type] || null;
}

function parseTransaction(tx) {
  var type = parseTransactionType(tx.TransactionType);
  var mapping = {
    'payment': parsePayment,
    'trustline': parseTrustline,
    'order': parseOrder,
    'orderCancellation': parseOrderCancellation,
    'settings': parseSettings,
    'suspendedPaymentCreation': parseSuspendedPaymentCreation,
    'suspendedPaymentExecution': parseSuspendedPaymentExecution,
    'suspendedPaymentCancellation': parseSuspendedPaymentCancellation
  };
  var parser = mapping[type];
  assert(parser !== undefined, 'Unrecognized transaction type');
  var specification = parser(tx);
  var outcome = utils.parseOutcome(tx);
  return utils.removeUndefined({
    type: type,
    address: tx.Account,
    sequence: tx.Sequence,
    id: tx.hash,
    specification: utils.removeUndefined(specification),
    outcome: outcome ? utils.removeUndefined(outcome) : undefined
  });
}

module.exports = parseTransaction;