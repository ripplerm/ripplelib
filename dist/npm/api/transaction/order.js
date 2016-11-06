
'use strict';
var utils = require('./utils');
var validate = utils.common.validate;
var Transaction = utils.common.core.Transaction;

var OfferCreateFlags = {
  passive: { set: 'Passive' },
  immediateOrCancel: { set: 'ImmediateOrCancel' },
  fillOrKill: { set: 'FillOrKill' }
};

function createOrderTransaction(account, order) {
  validate.address(account);
  validate.order(order);

  var transaction = new Transaction();
  var takerPays = utils.common.toRippledAmount(order.direction === 'buy' ? order.quantity : order.totalPrice);
  var takerGets = utils.common.toRippledAmount(order.direction === 'buy' ? order.totalPrice : order.quantity);

  transaction.offerCreate(account, takerPays, takerGets);

  utils.setTransactionBitFlags(transaction, order, OfferCreateFlags);
  if (order.direction === 'sell') {
    transaction.setFlags('Sell');
  }

  return transaction;
}

function prepareOrderAsync(account, order, instructions, callback) {
  var transaction = createOrderTransaction(account, order);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareOrder(account, order) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareOrderAsync.bind(this))(account, order, instructions);
}

module.exports = prepareOrder;