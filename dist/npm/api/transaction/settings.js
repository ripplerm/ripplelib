
'use strict';

var _Object$keys = require('babel-runtime/core-js/object/keys')['default'];

var assert = require('assert');
var BigNumber = require('bignumber.js');
var utils = require('./utils');
var validate = utils.common.validate;
var AccountFlagIndices = utils.common.constants.AccountFlagIndices;
var AccountFields = utils.common.constants.AccountFields;
var Transaction = utils.common.core.Transaction;

// Emptry string passed to setting will clear it
var CLEAR_SETTING = null;

function setTransactionFlags(transaction, values) {
  var keys = _Object$keys(values);
  assert(keys.length === 1, 'ERROR: can only set one setting per transaction');
  var flagName = keys[0];
  var value = values[flagName];
  var index = AccountFlagIndices[flagName];
  if (index !== undefined) {
    if (value) {
      transaction.tx_json.SetFlag = index;
    } else {
      transaction.tx_json.ClearFlag = index;
    }
  }
}

function setTransactionFields(transaction, input) {
  var fieldSchema = AccountFields;
  for (var fieldName in fieldSchema) {
    var field = fieldSchema[fieldName];
    var value = input[field.name];

    if (value === undefined) {
      continue;
    }

    // The value required to clear an account root field varies
    if (value === CLEAR_SETTING && field.hasOwnProperty('defaults')) {
      value = field.defaults;
    }

    if (field.encoding === 'hex' && !field.length) {
      // This is currently only used for Domain field
      value = new Buffer(value, 'ascii').toString('hex').toUpperCase();
    }

    transaction.tx_json[fieldName] = value;
  }
}

/**
 *  Note: A fee of 1% requires 101% of the destination to be sent for the
 *        destination to receive 100%.
 *  The transfer rate is specified as the input amount as fraction of 1.
 *  To specify the default rate of 0%, a 100% input amount, specify 1.
 *  To specify a rate of 1%, a 101% input amount, specify 1.01
 *
 *  @param {Number|String} transferRate
 *
 *  @returns {Number|String} numbers will be converted while strings
 *                           are returned
 */

function convertTransferRate(transferRate) {
  return new BigNumber(transferRate).shift(9).toNumber();
}

function createSettingsTransaction(account, settings) {
  validate.address(account);
  validate.settings(settings);

  var transaction = new Transaction();
  if (settings.regularKey) {
    return transaction.setRegularKey({
      account: account,
      regular_key: settings.regularKey
    });
  }

  transaction.accountSet(account);
  setTransactionFlags(transaction, settings);
  setTransactionFields(transaction, settings);

  if (transaction.tx_json.TransferRate !== undefined) {
    transaction.tx_json.TransferRate = convertTransferRate(transaction.tx_json.TransferRate);
  }
  return transaction;
}

function prepareSettingsAsync(account, settings, instructions, callback) {
  var transaction = createSettingsTransaction(account, settings);
  utils.prepareTransaction(transaction, this.remote, instructions, callback);
}

function prepareSettings(account, settings) {
  var instructions = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  return utils.promisify(prepareSettingsAsync.bind(this))(account, settings, instructions);
}

module.exports = prepareSettings;