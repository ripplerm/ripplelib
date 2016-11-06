'use strict';

/**
 * Type definitions for binary format.
 *
 * This file should not be included directly. Instead, find the format you're
 * trying to parse or serialize in binformat.js and pass that to
 * SerializedObject.parse() or SerializedObject.serialize().
 */

var _Object$keys = require('babel-runtime/core-js/object/keys')['default'];

var _ = require('lodash');
var assert = require('assert');
var extend = require('extend');
var BN = require('bn.js');
var GlobalBigNumber = require('bignumber.js');
var sjclcodec = require('sjcl-codec');
var Amount = require('./amount').Amount;
var Currency = require('./currency').Currency;
var binformat = require('./binformat');
var utils = require('./utils');

var UInt128 = require('./uint128').UInt128;
var UInt160 = require('./uint160').UInt160;
var UInt256 = require('./uint256').UInt256;
var Base = require('./base').Base;

var BigNumber = GlobalBigNumber.another({
  ROUNDING_MODE: GlobalBigNumber.ROUND_HALF_UP,
  DECIMAL_PLACES: 40
});

function SerializedType(methods) {
  extend(this, methods);
}

function isNumber(val) {
  return typeof val === 'number' && isFinite(val);
}

function isString(val) {
  return typeof val === 'string';
}

function isHexInt64String(val) {
  return isString(val) && /^[0-9A-F]{0,16}$/i.test(val);
}

function serializeBytes(so, byteData, noLength) {
  if (!noLength) {
    SerializedType.serialize_varint(so, byteData.length);
  }
  so.append(byteData);
}

function serializeHex(so, hexData, noLength) {
  serializeBytes(so, utils.hexToArray(hexData), noLength);
}

function convertHexToString(hexString) {
  var bits = sjclcodec.hex.toBits(hexString);
  return sjclcodec.utf8String.fromBits(bits);
}

function sort_fields(keys) {
  function sort_field_compare(a, b) {
    var a_field_coordinates = binformat.fieldsInverseMap[a];
    var a_type_bits = a_field_coordinates[0];
    var a_field_bits = a_field_coordinates[1];
    var b_field_coordinates = binformat.fieldsInverseMap[b];
    var b_type_bits = b_field_coordinates[0];
    var b_field_bits = b_field_coordinates[1];

    // Sort by type id first, then by field id
    return a_type_bits !== b_type_bits ? a_type_bits - b_type_bits : a_field_bits - b_field_bits;
  }

  return keys.sort(sort_field_compare);
}

SerializedType.serialize_varint = function (so, val) {
  var value = val;
  if (value < 0) {
    throw new Error('Variable integers are unsigned.');
  }

  if (value <= 192) {
    so.append([value]);
  } else if (value <= 12480) {
    value -= 193;
    so.append([193 + (value >>> 8), value & 0xff]);
  } else if (value <= 918744) {
    value -= 12481;
    so.append([241 + (value >>> 16), value >>> 8 & 0xff, value & 0xff]);
  } else {
    throw new Error('Variable integer overflow.');
  }
};

SerializedType.prototype.parse_varint = function (so) {
  var b1 = so.read(1)[0];
  var b2 = undefined,
      b3 = undefined;
  var result = undefined;

  if (b1 > 254) {
    throw new Error('Invalid varint length indicator');
  }

  if (b1 <= 192) {
    result = b1;
  } else if (b1 <= 240) {
    b2 = so.read(1)[0];
    result = 193 + (b1 - 193) * 256 + b2;
  } else if (b1 <= 254) {
    b2 = so.read(1)[0];
    b3 = so.read(1)[0];
    result = 12481 + (b1 - 241) * 65536 + b2 * 256 + b3;
  }

  return result;
};

// In the following, we assume that the inputs are in the proper range. Is this
// correct?
// Helper functions for 1-, 2-, and 4-byte integers.

/**
 * Convert an integer value into an array of bytes.
 *
 * The result is appended to the serialized object ('so').
 *
 * @param {Number} val value
 * @param {Number} bytes byte size
 * @return {Array} byte array
 */
function convertIntegerToByteArray(val, bytes) {
  if (!isNumber(val)) {
    throw new Error('Value is not a number', bytes);
  }

  if (val < 0 || val >= Math.pow(256, bytes)) {
    throw new Error('Value out of bounds ');
  }

  var newBytes = [];

  for (var i = 0; i < bytes; i++) {
    newBytes.unshift(val >>> i * 8 & 0xff);
  }

  return newBytes;
}

// Convert a certain number of bytes from the serialized object ('so') into an
// integer.
function readAndSum(so, bytes) {
  var sum = 0;

  if (bytes > 4) {
    throw new Error('This function only supports up to four bytes.');
  }

  for (var i = 0; i < bytes; i++) {
    var byte = so.read(1)[0];
    sum += byte << 8 * (bytes - i - 1);
  }

  // Convert to unsigned integer
  return sum >>> 0;
}

var STInt8 = exports.Int8 = new SerializedType({
  serialize: function serialize(so, val) {
    so.append(convertIntegerToByteArray(val, 1));
  },
  parse: function parse(so) {
    return readAndSum(so, 1);
  }
});

STInt8.id = 16;

function _serialize(so, field_name, value) {
  // so: a byte-stream to serialize into.
  // field_name: a string for the field name ('LedgerEntryType' etc.)
  // value: the value of that field.
  var field_coordinates = binformat.fieldsInverseMap[field_name];
  var type_bits = field_coordinates[0];
  var field_bits = field_coordinates[1];
  var tag_byte = (type_bits < 16 ? type_bits << 4 : 0) | (field_bits < 16 ? field_bits : 0);
  var val = value;

  if (field_name === 'LedgerEntryType' && typeof val === 'string') {
    val = binformat.ledger[val][0];
  }

  if (field_name === 'TransactionResult' && typeof val === 'string') {
    val = binformat.ter[val];
  }

  STInt8.serialize(so, tag_byte);

  if (type_bits >= 16) {
    STInt8.serialize(so, type_bits);
  }

  if (field_bits >= 16) {
    STInt8.serialize(so, field_bits);
  }

  // Get the serializer class (ST...)
  var serialized_object_type = undefined;

  if (field_name === 'Memo' && typeof val === 'object') {
    // for Memo we override the default behavior with our STMemo serializer
    serialized_object_type = exports.STMemo;
  } else {
    // for a field based on the type bits.
    serialized_object_type = exports[binformat.types[type_bits]];
  }

  try {
    serialized_object_type.serialize(so, val);
  } catch (e) {
    e.message += ' (' + field_name + ')';
    throw e;
  }
}

exports.serialize = exports.serialize_whatever = _serialize;

// Take the serialized object, figure out what type/field it is, and return the
// parsing of that.

function _parse(so) {
  var tag_byte = so.read(1)[0];
  var type_bits = tag_byte >> 4;

  if (type_bits === 0) {
    type_bits = so.read(1)[0];
  }

  var field_bits = tag_byte & 0x0f;
  var field_name = field_bits === 0 ? binformat.fields[type_bits][so.read(1)[0]] : binformat.fields[type_bits][field_bits];

  assert(field_name, 'Unknown field - header byte is 0x' + tag_byte.toString(16));

  // Get the parser class (ST...) for a field based on the type bits.
  var type = field_name === 'Memo' ? exports.STMemo : exports[binformat.types[type_bits]];

  assert(type, 'Unknown type - header byte is 0x' + tag_byte.toString(16));

  return [field_name, type.parse(so)]; // key, value
}

exports.parse = exports.parse_whatever = _parse;

var STInt16 = exports.Int16 = new SerializedType({
  serialize: function serialize(so, val) {
    so.append(convertIntegerToByteArray(val, 2));
  },
  parse: function parse(so) {
    return readAndSum(so, 2);
  }
});

STInt16.id = 1;

var STInt32 = exports.Int32 = new SerializedType({
  serialize: function serialize(so, val) {
    so.append(convertIntegerToByteArray(val, 4));
  },
  parse: function parse(so) {
    return readAndSum(so, 4);
  }
});

STInt32.id = 2;

var STInt64 = exports.Int64 = new SerializedType({
  serialize: function serialize(so, val) {
    var bigNumObject = undefined;
    var value = val;

    if (isNumber(value)) {
      value = Math.floor(value);
      if (value < 0) {
        throw new Error('Negative value for unsigned Int64 is invalid.');
      }
      bigNumObject = new BN(value, 10);
    } else if (isString(value)) {
      if (!isHexInt64String(value)) {
        throw new Error('Not a valid hex Int64.');
      }
      bigNumObject = new BN(value, 16);
    } else if (value instanceof BN) {
      if (value.cmpn(0) < 0) {
        throw new Error('Negative value for unsigned Int64 is invalid.');
      }
      bigNumObject = value;
    } else {
      throw new Error('Invalid type for Int64: ' + typeof value + ' value');
    }
    // `'be'` means big endian, and the following arg is the byte length, which
    // it will pad with 0s to if not enough bytes, or throw if over
    serializeBytes(so, bigNumObject.toArray('be', 8), /* noLength= */true);
  },
  parse: function parse(so) {
    var bytes = so.read(8);
    return new BN(bytes);
  }
});

STInt64.id = 3;

var STHash128 = exports.Hash128 = new SerializedType({
  serialize: function serialize(so, val) {
    var hash = UInt128.from_json(val);
    if (!hash.is_valid()) {
      throw new Error('Invalid Hash128');
    }
    serializeBytes(so, hash.to_bytes(), true); // noLength = true
  },
  parse: function parse(so) {
    return UInt128.from_bytes(so.read(16));
  }
});

STHash128.id = 4;

var STHash256 = exports.Hash256 = new SerializedType({
  serialize: function serialize(so, val) {
    var hash = UInt256.from_json(val);
    if (!hash.is_valid()) {
      throw new Error('Invalid Hash256');
    }
    serializeBytes(so, hash.to_bytes(), true); // noLength = true
  },
  parse: function parse(so) {
    return UInt256.from_bytes(so.read(32));
  }
});

STHash256.id = 5;

var STHash160 = exports.Hash160 = new SerializedType({
  serialize: function serialize(so, val) {
    var hash = UInt160.from_json(val);
    if (!hash.is_valid()) {
      throw new Error('Invalid Hash160');
    }
    serializeBytes(so, hash.to_bytes(), true); // noLength = true
  },
  parse: function parse(so) {
    return UInt160.from_bytes(so.read(20));
  }
});

STHash160.id = 17;

// Internal
var STCurrency = new SerializedType({
  serialize: function serialize(so, val) {
    var currencyData = val.to_bytes();

    if (!currencyData) {
      throw new Error('Tried to serialize invalid/unimplemented currency type.');
    }

    so.append(currencyData);
  },
  parse: function parse(so) {
    var bytes = so.read(20);
    var currency = Currency.from_bytes(bytes);
    // XXX Disabled check. Theoretically, the Currency class should support any
    //     UInt160 value and consider it valid. But it doesn't, so for the
    //     deserialization to be usable, we need to allow invalid results for
    //     now.
    // if (!currency.is_valid()) {
    //   throw new Error('Invalid currency: '+convertByteArrayToHex(bytes));
    // }
    return currency;
  }
});

/**
 * Quality is encoded into 64 bits:
 * (8 bits offset) (56 bits mantissa)
 *
 * Quality differs from Amount because it does not need the first two bits
 * to represent non-native and non-negative
 */
exports.Quality = new SerializedType({
  serialize: function serialize(so, val) {
    var value = undefined;
    // if in format: amount/currency/issuer
    if (_.includes(val, '/')) {
      var amount = Amount.from_json(val);

      if (!amount.is_valid()) {
        throw new Error('Not a valid Amount object.');
      }
      value = new BigNumber(amount.to_text());
    } else {
      value = new BigNumber(val);
    }

    var hi = 0,
        lo = 0;

    var offset = value.e - 15;
    if (val !== 0) {
      // First eight bits: offset/exponent
      hi |= (100 + offset & 0xff) << 24;

      // Remaining 56 bits: mantissa
      var mantissaDecimal = utils.getMantissaDecimalString(value.abs());
      var mantissaHex = new BigNumber(mantissaDecimal).toString(16);
      assert(mantissaHex.length <= 16, 'Mantissa hex representation ' + mantissaHex + ' exceeds the maximum length of 16');
      hi |= parseInt(mantissaHex.slice(0, -8), 16) & 0xffffff;
      lo = parseInt(mantissaHex.slice(-8), 16);
    }

    var valueBytes = sjclcodec.bytes.fromBits([hi, lo]);

    so.append(valueBytes);
  }
});

/*
 * Amount is encoded into 64 bits:
 * (1 bit non-native) (1 bit non-negative) (8 bits offset) (54 bits mantissa)
 */
var STAmount = exports.Amount = new SerializedType({
  serialize: function serialize(so, val) {
    var amount = Amount.from_json(val);

    if (!amount.is_valid()) {
      throw new Error('Not a valid Amount object.');
    }

    var value = new BigNumber(amount.to_text());
    var offset = value.e - 15;

    // Amount (64-bit integer)
    var valueBytes = utils.arraySet(8, 0);

    if (amount.is_native()) {
      var valueHex = value.abs().toString(16);

      if (Amount.strict_mode && value.abs().greaterThan(Amount.bi_xns_max)) {
        throw new Error('Value out of bounds');
      }

      // Enforce correct length (64 bits)
      if (Amount.strict_mode && valueHex.length > 16) {
        throw new Error('Value out of bounds');
      }

      while (valueHex.length < 16) {
        valueHex = '0' + valueHex;
      }

      valueBytes = sjclcodec.bytes.fromBits(sjclcodec.hex.toBits(valueHex));
      // Clear most significant two bits - these bits should already be 0 if
      // Amount enforces the range correctly, but we'll clear them anyway just
      // so this code can make certain guarantees about the encoded value.
      valueBytes[0] &= 0x3f;

      if (!amount.is_negative()) {
        valueBytes[0] |= 0x40;
      }
    } else {
      var hi = 0,
          lo = 0;

      // First bit: non-native
      hi |= 1 << 31;

      if (!amount.is_zero()) {
        // Second bit: non-negative?
        if (!amount.is_negative()) {
          hi |= 1 << 30;
        }

        // Next eight bits: offset/exponent
        hi |= (97 + offset & 0xff) << 22;

        // Remaining 54 bits: mantissa
        var mantissaDecimal = utils.getMantissaDecimalString(value.abs());
        var mantissaHex = new BigNumber(mantissaDecimal).toString(16);
        assert(mantissaHex.length <= 16, 'Mantissa hex representation ' + mantissaHex + ' exceeds the maximum length of 16');
        hi |= parseInt(mantissaHex.slice(0, -8), 16) & 0x3fffff;
        lo = parseInt(mantissaHex.slice(-8), 16);
      }

      valueBytes = sjclcodec.bytes.fromBits([hi, lo]);
    }

    so.append(valueBytes);

    if (!amount.is_native()) {
      // Currency (160-bit hash)
      var currency = amount.currency();
      STCurrency.serialize(so, currency, true);

      // Issuer (160-bit hash)
      so.append(amount.issuer().to_bytes());
    }
  },
  parse: function parse(so) {
    var value_bytes = so.read(8);
    var is_zero = !(value_bytes[0] & 0x7f);

    for (var i = 1; i < 8; i++) {
      is_zero = is_zero && !value_bytes[i];
    }

    var is_negative = !is_zero && !(value_bytes[0] & 0x40);

    if (value_bytes[0] & 0x80) {
      // non-native
      var currency = STCurrency.parse(so);
      var issuer_bytes = so.read(20);
      var issuer = UInt160.from_bytes(issuer_bytes);
      issuer.set_version(Base.VER_ACCOUNT_ID);
      var offset = ((value_bytes[0] & 0x3f) << 2) + (value_bytes[1] >>> 6) - 97;
      var mantissa_bytes = value_bytes.slice(1);
      mantissa_bytes[0] &= 0x3f;
      var mantissa = new BigNumber(utils.arrayToHex(mantissa_bytes), 16);
      var sign = is_negative ? '-' : '';
      var valueString = sign + mantissa.toString() + 'e' + offset.toString();

      return Amount.from_json({
        currency: currency,
        issuer: issuer.to_json(),
        value: valueString
      });
    }

    // native
    var integer_bytes = value_bytes.slice();
    integer_bytes[0] &= 0x3f;
    var integer_hex = utils.arrayToHex(integer_bytes);
    var value = new BigNumber(integer_hex, 16);
    return Amount.from_json((is_negative ? '-' : '') + value.toString());
  }
});

STAmount.id = 6;

var STVL = exports.VariableLength = exports.VL = new SerializedType({
  serialize: function serialize(so, val) {
    if (typeof val === 'string') {
      serializeHex(so, val);
    } else {
      throw new Error('Unknown datatype.');
    }
  },
  parse: function parse(so) {
    var len = this.parse_varint(so);
    return utils.arrayToHex(so.read(len));
  }
});

STVL.id = 7;

var STAccount = exports.Account = new SerializedType({
  serialize: function serialize(so, val) {
    var account = UInt160.from_json(val);
    if (!account.is_valid()) {
      throw new Error('Invalid account!');
    }
    serializeBytes(so, account.to_bytes());
  },
  parse: function parse(so) {
    var len = this.parse_varint(so);

    if (len !== 20) {
      throw new Error('Non-standard-length account ID');
    }

    var result = UInt160.from_bytes(so.read(len));
    result.set_version(Base.VER_ACCOUNT_ID);

    if (false && !result.is_valid()) {
      throw new Error('Invalid Account');
    }

    return result;
  }
});

STAccount.id = 8;

var STPathSet = exports.PathSet = new SerializedType({
  typeBoundary: 0xff,
  typeEnd: 0x00,
  typeAccount: 0x01,
  typeCurrency: 0x10,
  typeIssuer: 0x20,
  serialize: function serialize(so, val) {
    for (var i = 0, l = val.length; i < l; i++) {
      // Boundary
      if (i) {
        STInt8.serialize(so, this.typeBoundary);
      }

      for (var j = 0, l2 = val[i].length; j < l2; j++) {
        var entry = val[i][j];
        // if (entry.hasOwnProperty('_value')) {entry = entry._value;}
        var type = 0;

        if (entry.account) {
          type |= this.typeAccount;
        }
        if (entry.currency) {
          type |= this.typeCurrency;
        }
        if (entry.issuer) {
          type |= this.typeIssuer;
        }

        STInt8.serialize(so, type);

        if (entry.account) {
          STHash160.serialize(so, entry.account);
        }

        if (entry.currency) {
          var currency = Currency.from_json(entry.currency, entry.non_native);
          STCurrency.serialize(so, currency);
        }

        if (entry.issuer) {
          STHash160.serialize(so, entry.issuer);
        }
      }
    }

    STInt8.serialize(so, this.typeEnd);
  },
  parse: function parse(so) {
    // should return a list of lists:
    /*
       [
       [entry, entry],
       [entry, entry, entry],
       [entry],
       []
       ]
        each entry has one or more of the following attributes:
       amount, currency, issuer.
       */

    var path_list = [];
    var current_path = [];
    var tag_byte = undefined;

    /* eslint-disable no-cond-assign */

    while ((tag_byte = so.read(1)[0]) !== this.typeEnd) {
      // TODO: try/catch this loop, and catch when we run out of data without
      // reaching the end of the data structure.
      // Now determine: is this an end, boundary, or entry-begin-tag?
      // console.log('Tag byte:', tag_byte);
      if (tag_byte === this.typeBoundary) {
        if (current_path) {
          // close the current path, if there is one,
          path_list.push(current_path);
        }
        current_path = []; // and start a new one.
        continue;
      }

      // It's an entry-begin tag.
      var entry = {};
      var type = 0;

      if (tag_byte & this.typeAccount) {
        entry.account = STHash160.parse(so);
        entry.account.set_version(Base.VER_ACCOUNT_ID);
        type = type | this.typeAccount;
      }
      if (tag_byte & this.typeCurrency) {
        entry.currency = STCurrency.parse(so);
        if (entry.currency.to_json() === 'XRP' && !entry.currency.is_native()) {
          entry.non_native = true;
        }
        type = type | this.typeCurrency;
      }
      if (tag_byte & this.typeIssuer) {
        entry.issuer = STHash160.parse(so);
        // Enable and set correct type of base-58 encoding
        entry.issuer.set_version(Base.VER_ACCOUNT_ID);
        type = type | this.typeIssuer;
      }

      if (entry.account || entry.currency || entry.issuer) {
        entry.type = type;
        entry.type_hex = ('000000000000000' + type.toString(16)).slice(-16);
        current_path.push(entry);
      } else {
        // It must have at least something in it.
        throw new Error('Invalid path entry');
      }
    }

    if (current_path) {
      // close the current path, if there is one,
      path_list.push(current_path);
    }

    return path_list;
  }
});

STPathSet.id = 18;

var STVector256 = exports.Vector256 = new SerializedType({
  serialize: function serialize(so, val) {
    // Assume val is an array of STHash256 objects.
    SerializedType.serialize_varint(so, val.length * 32);
    for (var i = 0, l = val.length; i < l; i++) {
      STHash256.serialize(so, val[i]);
    }
  },
  parse: function parse(so) {
    var length = this.parse_varint(so);
    var output = [];
    // length is number of bytes not number of Hash256
    for (var i = 0; i < length / 32; i++) {
      output.push(STHash256.parse(so));
    }
    return output;
  }
});

STVector256.id = 19;

// Internal
exports.STMemo = new SerializedType({
  serialize: function serialize(so, val, no_marker) {
    var keys = [];

    _Object$keys(val).forEach(function (key) {
      // Ignore lowercase field names - they're non-serializable fields by
      // convention.
      if (key[0] === key[0].toLowerCase()) {
        return;
      }

      if (typeof binformat.fieldsInverseMap[key] === 'undefined') {
        throw new Error('JSON contains unknown field: "' + key + '"');
      }

      keys.push(key);
    });

    // Sort fields
    keys = sort_fields(keys);

    keys.forEach(function (key) {
      _serialize(so, key, val[key]);
    });

    if (!no_marker) {
      // Object ending marker
      STInt8.serialize(so, 0xe1);
    }
  },
  parse: function parse(so) {
    var output = {};

    while (so.peek(1)[0] !== 0xe1) {
      var keyval = _parse(so);
      output[keyval[0]] = keyval[1];
    }

    if (output.MemoType !== undefined) {
      try {
        var parsedType = convertHexToString(output.MemoType);

        if (parsedType !== 'unformatted_memo') {
          output.parsed_memo_type = parsedType;
        }
        /* eslint-disable no-empty */
      } catch (e) {}
      // empty
      // we don't know what's in the binary, apparently it's not a UTF-8
      // string
      // this is fine, we won't add the parsed_memo_type field

      /* eslint-enable no-empty */
    }

    if (output.MemoFormat !== undefined) {
      try {
        output.parsed_memo_format = convertHexToString(output.MemoFormat);
        /* eslint-disable no-empty */
      } catch (e) {}
      // empty
      // we don't know what's in the binary, apparently it's not a UTF-8
      // string
      // this is fine, we won't add the parsed_memo_format field

      /* eslint-enable no-empty */
    }

    if (output.MemoData !== undefined) {

      try {
        if (output.parsed_memo_format === 'json') {
          // see if we can parse JSON
          output.parsed_memo_data = JSON.parse(convertHexToString(output.MemoData));
        } else if (output.parsed_memo_format === 'text') {
          // otherwise see if we can parse text
          output.parsed_memo_data = convertHexToString(output.MemoData);
        }
        /* eslint-disable no-empty */
      } catch (e) {}
      // empty
      // we'll fail in case the content does not match what the MemoFormat
      // described
      // this is fine, we won't add the parsed_memo_data, the user has to
      // parse themselves

      /* eslint-enable no-empty */
    }

    so.read(1);
    return output;
  }

});

var STObject = exports.Object = new SerializedType({
  serialize: function serialize(so, val, no_marker) {
    var keys = [];

    _Object$keys(val).forEach(function (key) {
      // Ignore lowercase field names - they're non-serializable fields by
      // convention.
      if (key[0] === key[0].toLowerCase()) {
        return;
      }

      if (typeof binformat.fieldsInverseMap[key] === 'undefined') {
        throw new Error('JSON contains unknown field: "' + key + '"');
      }

      keys.push(key);
    });

    // Sort fields
    keys = sort_fields(keys);

    for (var i = 0; i < keys.length; i++) {
      _serialize(so, keys[i], val[keys[i]]);
    }

    if (!no_marker) {
      // Object ending marker
      STInt8.serialize(so, 0xe1);
    }
  },

  parse: function parse(so) {
    var output = {};
    while (so.peek(1)[0] !== 0xe1) {
      var keyval = _parse(so);
      output[keyval[0]] = keyval[1];
    }
    so.read(1);
    return output;
  }
});

STObject.id = 14;

var STArray = exports.Array = new SerializedType({
  serialize: function serialize(so, val) {
    for (var i = 0, l = val.length; i < l; i++) {
      var keys = _Object$keys(val[i]);

      if (keys.length !== 1) {
        throw new Error('Cannot serialize an array containing non-single-key objects');
      }

      var field_name = keys[0];
      var value = val[i][field_name];
      _serialize(so, field_name, value);
    }

    // Array ending marker
    STInt8.serialize(so, 0xf1);
  },

  parse: function parse(so) {
    var output = [];

    while (so.peek(1)[0] !== 0xf1) {
      var keyval = _parse(so);
      var obj = {};
      obj[keyval[0]] = keyval[1];
      output.push(obj);
    }

    so.read(1);

    return output;
  }
});

STArray.id = 15;