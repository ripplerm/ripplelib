/* eslint max-len: 0 */
'use strict';
const assert = require('assert');
const Seed = require('ripplelib').Seed;

function assert_helper(passphrase, address_or_nth, expected) {
  const seed = new Seed().parse_passphrase(passphrase);
  const keypair = seed.get_key(address_or_nth, 500);
  assert.strictEqual(keypair.to_hex_pub(), expected);
}

function _isNaN(n) {
  return typeof n === 'number' && isNaN(n);
}

describe('Seed', function() {
  it('saESc82Vun7Ta5EJRzGJbrXb5HNYk', function() {
    const seed = Seed.from_json('saESc82Vun7Ta5EJRzGJbrXb5HNYk');
    assert.strictEqual(seed.to_hex(), 'FF1CF838D02B2CF7B45BAC27F5F24F4F');
  });
  it('sp6iDHnmiPN7tQFHm5sCW59ax3hfE', function() {
    const seed = Seed.from_json('sp6iDHnmiPN7tQFHm5sCW59ax3hfE');
    assert.strictEqual(seed.to_hex(), '00AD8DA764C3C8AF5F9B8D51C94B9E49');
  });
  it('can generate many addresses', function() {

    const test_data = [
      // Format:
      // [passphrase, address, nth-for-seed, expected-public-key]
      ['masterpassphrase', 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', 0,
       '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020'],
      ['masterpassphrase', 'r4bYF7SLUMD7QgSLLpgJx38WJSY12ViRjP', 1,
       '02CD8C4CE87F86AAD1D9D18B03DE28E6E756F040BD72A9C127862833EB90D60BAD'],
      ['masterpassphrase', 'rLpAd4peHUMBPbVJASMYK5GTBUSwXRD9nx', 2,
       '0259A57642A6F4AEFC9B8062AF453FDEEEAC5572BA602BB1DBD5EF011394C6F9FC'],
      ['otherpassphrase', 'rpe3YWSVwGU2PmUzebAPg2deBXHtmba7hJ', 0,
       '022235A3DB2CAE57C60B7831929611D58867F86D28C0AD3C82473CC4A84990D01B'],
      ['otherpassphrase', 'raAPC2gALSmsTkXR4wUwQcPgX66kJuLv2S', 5,
       '03F0619AFABE08D22D98C8721895FE3673B6174168949976F2573CE1138C124994'],
      ['yetanotherpassphrase', 'rKnM44fS48qrGiDxB5fB5u64vHVJwjDPUo', 0,
       '0385AD049327EF7E5EC429350A15CEB23955037DE99660F6E70C11C5ABF4407036'],
      ['yetanotherpassphrase', 'rMvkT1RHPfsZwTFbKDKBEisa5U4d2a9V8n', 1,
       '023A2876EA130CBE7BBA0573C2DB4C4CEB9A7547666915BD40366CDC6150CF54DC']
    ];

    for (let nth = 0; nth < test_data.length; nth++) {
      const passphrase = test_data[nth][0];
      const address = test_data[nth][1];
      const nth_for_seed = test_data[nth][2];
      const expected = test_data[nth][3];

      // `seed.get_key($ripple_address)` is arguably an ill concieved feature
      // as it needs to generate `nth` many keypairs and generate hashed public
      // keys (addresses) for equality tests ??
      // Would need remote.set_secret(address, private_key_not_seed) ??
      assert_helper(passphrase, address, expected);

      // This isn't too bad as it only needs to generate one keypair `seq`
      assert_helper(passphrase, nth_for_seed, expected);
    }

  });

  it('should return the key_pair for a valid account and secret pair', function() {
    const address = 'r3GgMwvgvP8h4yVWvjH1dPZNvC37TjzBBE';
    const seed = Seed.from_json('shsWGZcmZz6YsWWmcnpfr6fLTdtFV');
    const keyPair = seed.get_key(address);
    assert.strictEqual(keyPair.get_address().to_json(), address);
    assert.strictEqual(keyPair.to_hex_pub(), '02F89EAEC7667B30F33D0687BBA86C3FE2A08CCA40A9186C5BDE2DAA6FA97A37D8');
  });

  it('should not find a KeyPair for a secret that does not belong to the given account', function() {
    const address = 'r3GgMwvgvP8h4yVWvjH1dPZNvC37TjzBBE';
    const secret = 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb';
    const seed = Seed.from_json('snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
    try {
      seed.get_key(address);
      assert(false, 'should throw an error');
    } catch(e) {
      assert.strictEqual(e.message, 'Too many loops looking for KeyPair yielding ' + address + ' from ' + secret);
    }

  });

  describe('parse_json', function() {
    it('empty string', function() {
      assert(_isNaN(new Seed().parse_json('').to_json()));
    });
    it('hex string', function() {
      // 32 0s is a valid hex repr of seed bytes
      const str = new Array(33).join('0');
      assert.strictEqual((new Seed().parse_json(str).to_json()),
                         'sp6JS7f14BuwFY8Mw6bTtLKWauoUs');
    });
    it('rfc1751', function() {
      const str = 'SLEW TALK DINT RIDE WET TINE BARK THEY JERK SLOT SLAB GONE';
      assert.strictEqual((new Seed().parse_json(str).to_json()),
                         'snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
    });
    it('null', function() {
      assert(_isNaN(new Seed().parse_json(null).to_json()));
    });
  });
  describe('parse_passphrase', function() {
    it('passphrase', function() {
      const str = new Array(60).join('0');
      assert.strictEqual('snFRPnVL3secohdpwSie8ANXdFQvG',
                         new Seed().parse_passphrase(str).to_json());
    });
    it('invalid passphrase', function() {
      assert.throws(function() {
        new Seed().parse_passphrase(null);
      });
    });
  });
  describe('get_key', function() {
    it('get key from invalid seed', function() {
      assert.throws(function() {
        new Seed().get_key('rBZ4j6MsoctipM6GEyHSjQKzXG3yambDnZ');
      });
    });
  });

  it('to rfc-1751 string', function() {
    const seed = Seed.from_json('snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
    assert.strictEqual(seed.to_rfc1751(), 'SLEW TALK DINT RIDE WET TINE BARK THEY JERK SLOT SLAB GONE');
  });

  it('get_generator', function() {
    const seed = Seed.from_json('snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
    assert.strictEqual(seed.get_generator().to_pub_hex(), '03D49C56E1B185F1BE899AE66A02EFC17F78EA6FC53AF85E0FE54C6E8B7F8C71A8');
    assert.strictEqual(seed.get_generator().to_pub_node(), 'n94a1u4jAz288pZLtw6yFWVbi89YamiC6JBXPVUj5zmExe5fTVg9');
  });

});

// vim:sw=2:sts=2:ts=8:et
