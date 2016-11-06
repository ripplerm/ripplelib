
'use strict';
var utils = require('./utils');
var validate = utils.common.validate;
var Transaction = utils.common.core.Transaction;
var BigNumber = require('bignumber.js');

var TrustSetFlags = {
  authorized: { set: 'SetAuth' },
  ripplingDisabled: { set: 'NoRipple', unset: 'ClearNoRipple' },
  frozen: { set: 'SetFreeze', unset: 'ClearFreeze' }
};

function convertQuality(quality) {
  return quality === undefined ? undefined : new BigNumber(quality).shift(9).truncated().toNumber();
}

function createTrustlineTransaction(account, trustline) {
  validate.address(account);
  validate.trustline(trustline);

  var limit = {
    currency: trustline.currency,
    issuer: trustline.counterparty,
    value: trustline.limit
  };

  var transaction = new Transaction();
  transaction.trustSet(account, limit, convertQuality(trustline.qualityIn), convertQuality(trustline.qualityOut));
  utils.setTransactionBitFlags(transaction, trustline, TrustSetFlags);
  return transaction;
}

function prepareTrustlineAsync(account, trustline, instructions, callback) {
  var transaction = createTrustlineTransaction(account, trustline);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareTrustline(account, trustline) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareTrustlineAsync.bind(this))(account, trustline, instructions);
}

module.exports = prepareTrustline;