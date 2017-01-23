'use strict';

/*eslint new-cap: 1*/

var sjcl = require('./utils').sjcl;

var UInt160 = require('./uint160').UInt160;
var UInt256 = require('./uint256').UInt256;
var Base = require('./base').Base;

function KeyPair() {
  this._curve = sjcl.ecc.curves.k256;
  this._secret = null;
  this._pubkey = null;
}

KeyPair.getRandom = function () {
  return this.from_bn_secret(sjcl.bn.fromBits(sjcl.random.randomWords(8, 6)));
}

KeyPair.from_json = function (j) {
  return j instanceof this ? j.clone() : new this().parse_json(j);
};

KeyPair.from_bn_secret = function (j) {
  return j instanceof this ? j.clone() : new this().parse_bn_secret(j);
};

KeyPair.is_valid = function (j) {
  return this.from_json(j).is_valid();
};

KeyPair.prototype.clone = function () {
  var c = new this.constructor();
  if (this.is_valid()) {
    var exponent = sjcl.bn.fromBits(this._secret_bits());
    c._secret = new sjcl.ecc.ecdsa.secretKey(sjcl.ecc.curves.k256, exponent);
  }
  return c;
};

KeyPair.prototype.parse_bn_secret = function (j) {
  this._secret = new sjcl.ecc.ecdsa.secretKey(sjcl.ecc.curves.k256, j);
  return this;
};

KeyPair.prototype.parse_json = function (j) {
  if (typeof j !== 'string') return this;
  var bn = undefined;
  if (/^[0-9a-fA-f]{64}$/.test(j)) {
    bn = new sjcl.bn(j, 16);
  } else {
    var versions = [
      Base.VER_NODE_PRIVATE,
      Base.VER_ACCOUNT_PRIVATE,
      Base.VER_FAMILY_GENERATOR
    ];
    bn = Base.decode_check(versions, j) ||
          Base.decode_check(128, j, 'bitcoin'); // bitoin WIF key
  }
  if (bn) this.parse_bn_secret(bn);
  return this;
};

KeyPair.prototype.is_valid = function () {
  return (this._secret instanceof sjcl.ecc.ecdsa.secretKey) && (this._secret._exponent instanceof sjcl.bn);
};

/**
 * @private
 *
 * @return {sjcl.ecc.ecdsa.publicKey} public key
 */
KeyPair.prototype._pub = function () {
  var curve = this._curve;

  if (!this._pubkey && this._secret) {
    var exponent = this._secret._exponent;

    this._pubkey = new sjcl.ecc.ecdsa.publicKey(curve, curve.G.mult(exponent));
  }

  return this._pubkey;
};


/**
 * @private
 *
 * @return {sjcl.bitArray} private key bits
 */
KeyPair.prototype._secret_bits = function () {
  if (!this.is_valid()) {
    return null;
  }
  return this._secret.get();
};

/**
 * @private
 *
 * @return {sjcl.bitArray} public key bits in compressed form
 */
KeyPair.prototype._pub_bits = function () {
  var pub = this._pub();

  if (!pub) {
    return null;
  }

  var point = pub._point,
      y_even = point.y.mod(2).equals(0);

  return sjcl.bitArray.concat([sjcl.bitArray.partial(8, y_even ? 0x02 : 0x03)], point.x.toBits(this._curve.r.bitLength()));
};

/**
 * @return {String} public key bytes in compressed form, hex encoded.
 */
KeyPair.prototype.to_pub_hex =
KeyPair.prototype.to_hex_pub = function () {
  var bits = this._pub_bits();

  if (!bits) {
    return null;
  }

  return sjcl.codec.hex.fromBits(bits).toUpperCase();
};

function sha256_ripemd160(bits) {
  return sjcl.hash.ripemd160.hash(sjcl.hash.sha256.hash(bits));
}

KeyPair.prototype.get_address = function () {
  var bits = this._pub_bits();

  if (!bits) {
    return null;
  }

  var hash = sha256_ripemd160(bits);

  var address = UInt160.from_bits(hash);
  address.set_version(Base.VER_ACCOUNT_ID);
  return address;
};

KeyPair.prototype.to_address_string = function () {
  return this.get_address().to_json();
};

KeyPair.prototype.sign = function (hash) {
  var PARANOIA_256_BITS = 6; // sjcl constant for ensuring 256 bits of entropy
  hash = UInt256.from_json(hash);
  var sig = this._secret.sign(hash.to_bits(), PARANOIA_256_BITS);
  sig = this._secret.canonicalizeSignature(sig);
  return this._secret.encodeDER(sig);
};

KeyPair.prototype.to_hex_pri =
KeyPair.prototype.to_pri_hex = function () {
  var bits = this._secret_bits();
  if (!bits) return null;
  return sjcl.codec.hex.fromBits(bits).toUpperCase();
};

KeyPair.prototype.to_pri_node = function () {
  var bits = this._secret_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_NODE_PRIVATE, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_pub_node = function () {
  var bits = this._pub_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_NODE_PUBLIC, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_pri_generator = function () {
  var bits = this._secret_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_FAMILY_GENERATOR, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_pub_generator = function () {
  var bits = this._pub_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_FAMILY_GENERATOR, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_wif =
KeyPair.prototype.to_pri_string =
KeyPair.prototype.to_pri_account = function () {
  var bits = this._secret_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_ACCOUNT_PRIVATE, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_pub_string =
KeyPair.prototype.to_pub_account = function () {
  var bits = this._pub_bits();
  if (!bits) return null;
  return Base.encode_check(Base.VER_ACCOUNT_PUBLIC, sjcl.codec.bytes.fromBits(bits));
};

KeyPair.prototype.to_wif_bitcoin = function () {
  var bits = this._secret_bits();
  if (!bits) return null;
  return Base.encode_check(128, sjcl.codec.bytes.fromBits(bits), 'bitcoin');
};

// get child-KeyPair, similar to the concept of bitcoin BIP-0032.
// when index > 2^31, look for hardened-child (offset derived from privateKey).
KeyPair.prototype.get_child = function (index, forceHardened) {
  if (typeof index == 'undefined') index = 0;

  var isValidUInt32 = typeof index === 'number' && index >= 0 && index < Math.pow(2, 32);
  if (!isValidUInt32) {
    throw new Error('childkey index must be a valid UInt32');
  }
  var hardened_value = Math.pow(2, 31);
  if (forceHardened && index < hardened_value) index += hardened_value;

  var isHardened = index >= hardened_value;

  var curve = this._curve;
  var private_gen = this._secret._exponent;
  var public_gen = curve.G.mult(private_gen);

  var chainCode = undefined;
  var chainSeed = isHardened ? 
                    sjcl.codec.bytes.fromBits(private_gen.toBits()) : 
                    public_gen.toBytesCompressed();

  var i = 0;
  do {
    chainCode = sjcl.bn.fromBits(firstHalfOfSHA512(append_int(append_int(chainSeed, index), i)));
    i++;
  } while (!curve.r.greaterEquals(chainCode));

  var sec = chainCode.add(private_gen).mod(curve.r);

  return KeyPair.from_bn_secret(sec);
};

function append_int(a, i) {
  return [].concat(a, i >> 24, i >> 16 & 0xff, i >> 8 & 0xff, i & 0xff);
}

function firstHalfOfSHA512(bytes) {
  return sjcl.bitArray.bitSlice(sjcl.hash.sha512.hash(sjcl.codec.bytes.toBits(bytes)), 0, 256);
}

exports.KeyPair = KeyPair;