
'use strict';
var _ = require('lodash');
var utils = require('./utils');
var validate = utils.common.validate;
var toRippledAmount = utils.common.toRippledAmount;
var Transaction = utils.common.core.Transaction;

function createSuspendedPaymentCreationTransaction(account, payment) {
  validate.address(account);
  validate.suspendedPaymentCreation(payment);

  var transaction = new Transaction();
  transaction.suspendedPaymentCreate({
    account: account,
    destination: payment.destination.address,
    amount: toRippledAmount(payment.destination.amount)
  });

  if (payment.digest) {
    transaction.setDigest(payment.digest);
  }
  if (payment.allowCancelAfter) {
    transaction.setAllowCancelAfter(payment.allowCancelAfter);
  }
  if (payment.allowExecuteAfter) {
    transaction.setAllowExecuteAfter(payment.allowExecuteAfter);
  }

  if (payment.source.tag) {
    transaction.sourceTag(payment.source.tag);
  }
  if (payment.destination.tag) {
    transaction.destinationTag(payment.destination.tag);
  }
  if (payment.memos) {
    _.forEach(payment.memos, function (memo) {
      return transaction.addMemo(memo.type, memo.format, memo.data);
    });
  }
  return transaction;
}

function prepareSuspendedPaymentCreationAsync(account, payment, instructions, callback) {
  var transaction = createSuspendedPaymentCreationTransaction(account, payment);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareSuspendedPaymentCreation(account, payment) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareSuspendedPaymentCreationAsync).call(this, account, payment, instructions);
}

module.exports = prepareSuspendedPaymentCreation;