
'use strict';
var _ = require('lodash');
var BigNumber = require('bignumber.js');
var common = require('../common');

function setTransactionBitFlags(transaction, values, flags) {
  for (var flagName in flags) {
    var flagValue = values[flagName];
    var flagConversions = flags[flagName];

    if (flagValue === true && flagConversions.set !== undefined) {
      transaction.setFlags(flagConversions.set);
    }
    if (flagValue === false && flagConversions.unset !== undefined) {
      transaction.setFlags(flagConversions.unset);
    }
  }
}

function getFeeDrops(remote) {
  var feeUnits = 10; // all transactions currently have a fee of 10 fee units
  return remote.feeTx(feeUnits).to_text();
}

function formatPrepareResponse(txJSON) {
  var instructions = {
    fee: txJSON.Fee,
    sequence: txJSON.Sequence,
    maxLedgerVersion: txJSON.LastLedgerSequence
  };
  return {
    txJSON: JSON.stringify(txJSON),
    instructions: _.omit(instructions, _.isUndefined)
  };
}

function prepareTransaction(transaction, remote, instructions, callback) {
  common.validate.instructions(instructions);

  transaction.complete();
  var account = transaction.getAccount();
  var txJSON = transaction.tx_json;

  if (instructions.maxLedgerVersion !== undefined) {
    txJSON.LastLedgerSequence = parseInt(instructions.maxLedgerVersion, 10);
  } else {
    var offset = instructions.maxLedgerVersionOffset !== undefined ? parseInt(instructions.maxLedgerVersionOffset, 10) : 3;
    txJSON.LastLedgerSequence = remote.getLedgerSequence() + offset;
  }

  if (instructions.fee !== undefined) {
    txJSON.Fee = common.xrpToDrops(instructions.fee);
  } else {
    var serverFeeDrops = getFeeDrops(remote);
    if (instructions.maxFee !== undefined) {
      var maxFeeDrops = common.xrpToDrops(instructions.maxFee);
      txJSON.Fee = BigNumber.min(serverFeeDrops, maxFeeDrops).toString();
    } else {
      txJSON.Fee = serverFeeDrops;
    }
  }

  if (instructions.sequence !== undefined) {
    txJSON.Sequence = parseInt(instructions.sequence, 10);
    callback(null, formatPrepareResponse(txJSON));
  } else {
    remote.findAccount(account).getNextSequence(function (error, sequence) {
      txJSON.Sequence = sequence;
      callback(error, formatPrepareResponse(txJSON));
    });
  }
}

module.exports = {
  setTransactionBitFlags: setTransactionBitFlags,
  prepareTransaction: prepareTransaction,
  common: common,
  promisify: common.promisify
};