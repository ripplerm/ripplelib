'use strict';

var _Object$create = require('babel-runtime/core-js/object/create')['default'];

var utils = require('./utils');
var extend = require('extend');
var UInt = require('./uint').UInt;

//
// UInt256 support
//

var UInt256 = extend(function () {
  this._value = NaN;
}, UInt);

UInt256.width = 32;
UInt256.prototype = _Object$create(extend({}, UInt.prototype));
UInt256.prototype.constructor = UInt256;

var HEX_ZERO = UInt256.HEX_ZERO = '00000000000000000000000000000000' + '00000000000000000000000000000000';

var HEX_ONE = UInt256.HEX_ONE = '00000000000000000000000000000000' + '00000000000000000000000000000001';

UInt256.STR_ZERO = utils.hexToString(HEX_ZERO);
UInt256.STR_ONE = utils.hexToString(HEX_ONE);

exports.UInt256 = UInt256;