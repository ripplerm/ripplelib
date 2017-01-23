'use strict';

//
// Seed support
//

var extend = require('extend');
var utils = require('./utils');
var sjcl = utils.sjcl;

var Base = require('./base').Base;
var UInt = require('./uint').UInt;
var UInt160 = require('./uint160').UInt160;
var KeyPair = require('./keypair').KeyPair;
var rfc1751 = require('./rfc1751');

var Seed = extend(function () {
  this._curve = sjcl.ecc.curves.k256;
  this._value = NaN;
}, UInt);

Seed.width = 16;
Seed.prototype = Object.create(extend({}, UInt.prototype));
Seed.prototype.constructor = Seed;

Seed.getRandom = function () {
  return this.from_bits(sjcl.random.randomWords(4, 6));
}

// value = NaN on error.
Seed.prototype.parse_json = function (j) {
  this._value = NaN;
  if (typeof j === 'string' && j.length) {
    if (j[0] === 's') {
      this._value = Base.decode_check(Base.VER_FAMILY_SEED, j);
    } else if (/^[0-9a-fA-F]{32}$/.test(j)) {
      this.parse_hex(j);
    } else if (/^([A-Z]{1,4} +)+[A-Z]{1,4}$/.test(j)){
      try { 
        this.parse_bytes(rfc1751.decode(j));
      } catch (e) {};
    }
  }
  return this;
};

Seed.prototype.parse_passphrase = function (j) {
  if (typeof j !== 'string') {
    throw new Error('Passphrase must be a string');
  }

  var hash = sjcl.hash.sha512.hash(sjcl.codec.utf8String.toBits(j));
  var bits = sjcl.bitArray.bitSlice(hash, 0, 128);

  this.parse_bits(bits);

  return this;
};

Seed.prototype.to_json = function () {
  if (!this.is_valid()) {
    return NaN;
  }

  var output = Base.encode_check(Base.VER_FAMILY_SEED, this.to_bytes());

  return output;
};

Seed.prototype.to_human =
Seed.prototype.to_rfc1751 = function () {
  if (!this.is_valid()) {
    return NaN;
  }
  return rfc1751.encode(this.to_bytes());
};

function append_int(a, i) {
  return [].concat(a, i >> 24, i >> 16 & 0xff, i >> 8 & 0xff, i & 0xff);
}

function firstHalfOfSHA512(bytes) {
  return sjcl.bitArray.bitSlice(sjcl.hash.sha512.hash(sjcl.codec.bytes.toBits(bytes)), 0, 256);
}

// get the FAMILY_GENERATOR
// return as KeyPair
Seed.prototype.get_generator = function () {
  if (!this.is_valid()) {
    throw new Error('Cannot generate keys from invalid seed!');
  }
  var private_gen = undefined;
  var curve = this._curve;
  var i = 0;

  do {
    private_gen = sjcl.bn.fromBits(firstHalfOfSHA512(append_int(this.to_bytes(), i)));
    i++;
  } while (!curve.r.greaterEquals(private_gen));

  return KeyPair.from_bn_secret(private_gen);
};

// Removed a `*` so this JSDoc-ish syntax is ignored.
// This will soon all change anyway.
/*
* @param account
*        {undefined}                 take first, default, KeyPair
*
*        {Number}                    specifies the account number of the KeyPair
*                                    desired.
*
*        {Uint160} (from_json able), specifies the address matching the KeyPair
*                                    that is desired.
*
* @param maxLoops (optional)
*        {Number}                    specifies the amount of attempts taken
*                                    to generate a matching KeyPair
*
*/

Seed.prototype.get_key = function (account, maxLoops) {
  var account_number = 0,
      address = undefined;
  var max_loops = maxLoops || 1;

  if (!this.is_valid()) {
    throw new Error('Cannot generate keys from invalid seed!');
  }
  if (account) {
    if (typeof account === 'number') {
      account_number = account;
    } else {
      address = UInt160.from_json(account);
    }
  }

  var g = this.get_generator();

  var key_pair = undefined;
  do {
    key_pair = g.get_child(account_number);
    account_number++;
    if (max_loops-- <= 0) {
      // We are almost certainly looking for an account that would take same
      // value of $too_long {forever, ...}
      throw new Error('Too many loops looking for KeyPair yielding ' + address.to_json() + ' from ' + this.to_json());
    }
  } while (address && !key_pair.get_address().equals(address));

  return key_pair;
};
exports.Seed = Seed;