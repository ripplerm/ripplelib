var assert = require('assert');
var Seed   = require('ripplelib').Seed;
var KeyPair = require('ripplelib').KeyPair;

describe('KeyPair', function() {
  it('can generate an address', function () {
    var seed = Seed.from_json("snoPBrXtMeMyMHUVTgbuqAfg1SUTb");
    var address = seed.get_key().get_address();
    assert.strictEqual(address.to_json(), 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
  });
  it('import/export hex', function () {
    var key = KeyPair.from_json("1ACAAEDECE405B2A958212629E16F2EB46B153EEE94CDD350FDEFF52795525B7");
    assert.strictEqual(key.to_pub_hex(), '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020');
    assert.strictEqual(key.to_pri_hex(), '1ACAAEDECE405B2A958212629E16F2EB46B153EEE94CDD350FDEFF52795525B7');
  });
  it('import/export wif', function () {
    var key = KeyPair.from_json("p9JfM6HHi64m6mvB6v5k7G2b1cXzGmYiCNJf6GHPKvFTWdeRVjh");
    assert.strictEqual(key.to_address_string(), 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
    assert.strictEqual(key.to_wif(), 'p9JfM6HHi64m6mvB6v5k7G2b1cXzGmYiCNJf6GHPKvFTWdeRVjh');
    assert.strictEqual(key.to_pri_string(), 'p9JfM6HHi64m6mvB6v5k7G2b1cXzGmYiCNJf6GHPKvFTWdeRVjh');
  });
  it('import/export wif bitcoin', function () {
    var key = KeyPair.from_json("5J25wVUHxgx4NtYUvR4g8QwPxLRVNxmAdJxEdLwemXSuuAMBusw");
    assert.strictEqual(key.to_pub_hex(), '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020');
    assert.strictEqual(key.to_wif_bitcoin(), '5J25wVUHxgx4NtYUvR4g8QwPxLRVNxmAdJxEdLwemXSuuAMBusw');
  });
  it('import/export rfc1751', function () {
    var str = 'HIP BEEN MARS HULK BAH HAWK HEAR EAT HIRE SIP DANK DOUG YAW GENE WILD ROSS REED HORN DUB WASH RUSE USES BANG SIGN';
    var key = KeyPair.from_json(str);
    assert.strictEqual(key.to_rfc1751(), str);
    assert.strictEqual(key.to_address_string(), 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
  });
  it('can generate childKey', function () {
    var key = KeyPair.from_json("p9JfM6HHi64m6mvB6v5k7G2b1cXzGmYiCNJf6GHPKvFTWdeRVjh");
    var child = key.get_child(0);
    assert.strictEqual(child.to_pri_hex(), '0EE25A908CCD78322929DB08FFC7F9F746B198D998BEB098FF2F15FD1DD3E80C');
    assert.strictEqual(child.to_pub_hex(), '0215383A93A8CCC1B02A269A7D45461BFF733633518472DABF42E2A25B4D694C96');
    assert.strictEqual(child.to_address_string(), 'r4BUhp9EYYSpLYHiKLzgvU2cZWuM92AFzK');
  });
  it('can generate hardened-childKey', function () {
    var key = KeyPair.from_json("p9JfM6HHi64m6mvB6v5k7G2b1cXzGmYiCNJf6GHPKvFTWdeRVjh");
    var n = Math.pow(2, 31);
    var child = key.get_child(n);
    var child2 = key.get_child(0, true);
    assert.strictEqual(child.to_address_string(), 'r4KLwaTJZCdVCYxqBudMeFATV1ymnYbRT1');
    assert.strictEqual(child.to_address_string(), child2.to_address_string());
  });
});

// vim:sw=2:sts=2:ts=8:et
