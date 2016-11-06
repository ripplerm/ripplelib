
'use strict';
var _ = require('lodash');
var utils = require('./utils');
var validate = utils.common.validate;
var Transaction = utils.common.core.Transaction;

function createSuspendedPaymentExecutionTransaction(account, payment) {
  validate.address(account);
  validate.suspendedPaymentExecution(payment);

  var transaction = new Transaction();
  transaction.suspendedPaymentFinish({
    account: account,
    owner: payment.owner,
    paymentSequence: payment.paymentSequence
  });

  if (payment.method) {
    transaction.setMethod(payment.method);
  }
  if (payment.digest) {
    transaction.setDigest(payment.digest);
  }
  if (payment.proof) {
    transaction.setProof(payment.proof);
  }

  if (payment.memos) {
    _.forEach(payment.memos, function (memo) {
      return transaction.addMemo(memo.type, memo.format, memo.data);
    });
  }
  return transaction;
}

function prepareSuspendedPaymentExecutionAsync(account, payment, instructions, callback) {
  var transaction = createSuspendedPaymentExecutionTransaction(account, payment);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareSuspendedPaymentExecution(account, payment) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareSuspendedPaymentExecutionAsync).call(this, account, payment, instructions);
}

module.exports = prepareSuspendedPaymentExecution;