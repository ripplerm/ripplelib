
'use strict';
var _ = require('lodash');
var BigNumber = require('bignumber.js');
var core = require('../../core');
var errors = require('./errors');
var es6promisify = require('es6-promisify');
var keypairs = require('ripple-keypairs');

function dropsToXrp(drops) {
  return new BigNumber(drops).dividedBy(1000000.0).toString();
}

function xrpToDrops(xrp) {
  return new BigNumber(xrp).times(1000000.0).floor().toString();
}

function toRippledAmount(amount) {
  if (amount.currency === 'XRP') {
    return xrpToDrops(amount.value);
  }
  return {
    currency: amount.currency,
    issuer: amount.counterparty ? amount.counterparty : amount.issuer,
    value: amount.value
  };
}

function generateAddress(options) {
  var secret = keypairs.generateSeed(options);
  var keypair = keypairs.deriveKeypair(secret);
  var address = keypairs.deriveAddress(keypair.publicKey);
  return { secret: secret, address: address };
}

function wrapCatch(asyncFunction) {
  return function () {
    try {
      asyncFunction.apply(this, arguments);
    } catch (error) {
      var callback = arguments[arguments.length - 1];
      callback(error);
    }
  };
}

function composeAsync(wrapper, callback) {
  return function (error, data) {
    if (error) {
      callback(error, data);
      return;
    }
    var result = undefined;
    try {
      result = wrapper(data);
    } catch (exception) {
      callback(exception);
      return;
    }
    callback(null, result);
  };
}

function convertErrors(callback) {
  return function (error, data) {
    if (error && !(error instanceof errors.RippleError)) {
      var error_ = new errors.RippleError(error);
      error_.data = data;
      callback(error_, data);
    } else if (error) {
      error.data = data;
      callback(error, data);
    } else {
      callback(error, data);
    }
  };
}

function convertExceptions(f) {
  return function () {
    try {
      return f.apply(this, arguments);
    } catch (error) {
      throw new errors.ApiError(error.message);
    }
  };
}

var FINDSNAKE = /([a-zA-Z]_[a-zA-Z])/g;
function convertKeysFromSnakeCaseToCamelCase(obj) {
  if (typeof obj === 'object') {
    var _ret = (function () {
      var newKey = undefined;
      return {
        v: _.reduce(obj, function (result, value, key) {
          newKey = key;
          if (FINDSNAKE.test(key)) {
            newKey = key.replace(FINDSNAKE, function (r) {
              return r[0] + r[2].toUpperCase();
            });
          }
          result[newKey] = convertKeysFromSnakeCaseToCamelCase(value);
          return result;
        }, {})
      };
    })();

    if (typeof _ret === 'object') return _ret.v;
  }
  return obj;
}

function promisify(asyncFunction) {
  return es6promisify(wrapCatch(asyncFunction));
}

module.exports = {
  core: core,
  dropsToXrp: dropsToXrp,
  xrpToDrops: xrpToDrops,
  toRippledAmount: toRippledAmount,
  generateAddress: generateAddress,
  composeAsync: composeAsync,
  wrapCatch: wrapCatch,
  convertExceptions: convertExceptions,
  convertErrors: convertErrors,
  convertKeysFromSnakeCaseToCamelCase: convertKeysFromSnakeCaseToCamelCase,
  promisify: promisify
};