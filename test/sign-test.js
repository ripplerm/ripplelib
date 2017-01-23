'use strict';

const assert = require('assert');
const Seed = require('ripplelib').Seed;

function _isNaN(n) {
  return typeof n === 'number' && isNaN(n);
}

describe('Signing', function() {
  describe('Keys', function() {
    it('SigningPubKey 1 (ripple-client issue #245)', function() {
      const seed = Seed.from_json('saESc82Vun7Ta5EJRzGJbrXb5HNYk');
      const key = seed.get_key('rBZ4j6MsoctipM6GEyHSjQKzXG3yambDnZ');
      const pub = key.to_hex_pub();
      assert.strictEqual(
        pub,
        '0396941B22791A448E5877A44CE98434DB217D6FB97D63F0DAD23BE49ED45173C9');
    });
    it('SigningPubKey 2 (master seed)', function() {
      const seed = Seed.from_json('snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
      const key = seed.get_key('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
      const pub = key.to_hex_pub();
      assert.strictEqual(
         pub,
        '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020');
    });
  });
});
