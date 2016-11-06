
'use strict';
var assert = require('assert');
var sjclcodec = require('sjcl-codec');
var utils = require('./utils');

function convertHexToString(hexString) {
  var bits = sjclcodec.hex.toBits(hexString);
  return sjclcodec.utf8String.fromBits(bits);
}

function parseSuspendedPaymentExecution(tx) {
  assert(tx.TransactionType === 'SuspendedPaymentFinish');

  return utils.removeUndefined({
    memos: utils.parseMemos(tx),
    owner: tx.Owner,
    paymentSequence: tx.OfferSequence,
    method: tx.Method,
    digest: tx.Digest,
    proof: tx.Proof ? convertHexToString(tx.Proof) : undefined
  });
}

module.exports = parseSuspendedPaymentExecution;