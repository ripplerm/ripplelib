
'use strict';
var _ = require('lodash');
var utils = require('./utils');
var validate = utils.common.validate;
var Transaction = utils.common.core.Transaction;

function createSuspendedPaymentCancellationTransaction(account, payment) {
  validate.address(account);
  validate.suspendedPaymentCancellation(payment);

  var transaction = new Transaction();
  transaction.suspendedPaymentCancel({
    account: account,
    owner: payment.owner,
    paymentSequence: payment.paymentSequence
  });

  if (payment.memos) {
    _.forEach(payment.memos, function (memo) {
      return transaction.addMemo(memo.type, memo.format, memo.data);
    });
  }
  return transaction;
}

function prepareSuspendedPaymentCancellationAsync(account, payment, instructions, callback) {
  var transaction = createSuspendedPaymentCancellationTransaction(account, payment);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareSuspendedPaymentCancellation(account, payment) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareSuspendedPaymentCancellationAsync).call(this, account, payment, instructions);
}

module.exports = prepareSuspendedPaymentCancellation;