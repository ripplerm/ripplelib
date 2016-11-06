
'use strict';
var _ = require('lodash');
var utils = require('./utils');
var validate = utils.common.validate;
var toRippledAmount = utils.common.toRippledAmount;
var Transaction = utils.common.core.Transaction;

function isXRPToXRPPayment(payment) {
  var sourceCurrency = _.get(payment, 'source.maxAmount.currency');
  var destinationCurrency = _.get(payment, 'destination.amount.currency');
  return sourceCurrency === 'XRP' && destinationCurrency === 'XRP';
}

function isIOUWithoutCounterparty(amount) {
  return amount && amount.currency !== 'XRP' && amount.counterparty === undefined;
}

function applyAnyCounterpartyEncoding(payment) {
  // Convert blank counterparty to sender or receiver's address
  //   (Ripple convention for 'any counterparty')
  // https://ripple.com/build/transactions/
  //    #special-issuer-values-for-sendmax-and-amount
  // https://ripple.com/build/ripple-rest/#counterparties-in-payments
  if (isIOUWithoutCounterparty(payment.source.maxAmount)) {
    payment.source.maxAmount.counterparty = payment.source.address;
  }
  if (isIOUWithoutCounterparty(payment.destination.amount)) {
    payment.destination.amount.counterparty = payment.destination.address;
  }
}

function createPaymentTransaction(account, payment) {
  applyAnyCounterpartyEncoding(payment);
  validate.address(account);
  validate.payment(payment);

  var transaction = new Transaction();
  transaction.payment({
    from: payment.source.address,
    to: payment.destination.address,
    amount: toRippledAmount(payment.destination.amount)
  });

  if (payment.invoiceID) {
    transaction.invoiceID(payment.invoiceID);
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
  if (payment.allowPartialPayment) {
    transaction.setFlags(['PartialPayment']);
  }
  if (payment.noDirectRipple) {
    transaction.setFlags(['NoRippleDirect']);
  }
  if (payment.limitQuality) {
    transaction.setFlags(['LimitQuality']);
  }
  if (!isXRPToXRPPayment(payment)) {
    // Don't set SendMax for XRP->XRP payment
    // temREDUNDANT_SEND_MAX removed in:
    // https://github.com/ripple/rippled/commit/
    //  c522ffa6db2648f1d8a987843e7feabf1a0b7de8/
    transaction.sendMax(toRippledAmount(payment.source.maxAmount));

    if (payment.paths) {
      transaction.paths(JSON.parse(payment.paths));
    }
  }

  return transaction;
}

function preparePaymentAsync(account, payment, instructions, callback) {
  var transaction = createPaymentTransaction(account, payment);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function preparePayment(account, payment) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(preparePaymentAsync.bind(this))(account, payment, instructions);
}

module.exports = preparePayment;