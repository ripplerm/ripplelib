
'use strict';
var utils = require('./utils');
var validate = utils.common.validate;
var Transaction = utils.common.core.Transaction;

function createOrderCancellationTransaction(account, sequence) {
  validate.address(account);
  validate.sequence(sequence);

  var transaction = new Transaction();
  transaction.offerCancel(account, sequence);
  return transaction;
}

function prepareOrderCancellationAsync(account, sequence, instructions, callback) {
  var transaction = createOrderCancellationTransaction(account, sequence);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareOrderCancellation(account, sequence) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareOrderCancellationAsync.bind(this))(account, sequence, instructions);
}

module.exports = prepareOrderCancellation;