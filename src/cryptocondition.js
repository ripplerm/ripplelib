'use strict'

var asn = require('asn1.js')

var Simple256Condition = asn.define('Simple256Condition', function () {
  this.seq().obj(
    this.key('fingerprint').implicit(0).octstr(),
    this.key('cost').implicit(1).int()
  )
})

var Compound256Condition = asn.define('Compound256Condition', function () {
  this.seq().obj(
    this.key('fingerprint').implicit(0).octstr(),
    this.key('cost').implicit(1).int(),
    this.key('subtypes').implicit(2).bitstr()
  )
})

var Condition = asn.define('Condition', function () {
  this.choice({
    preimageSha256Condition: this.implicit(0).use(Simple256Condition),
    prefixSha256Condition: this.implicit(1).use(Compound256Condition),
    thresholdSha256Condition: this.implicit(2).use(Compound256Condition),
    rsaSha256Condition: this.implicit(3).use(Simple256Condition),
    ed25519Sha256Condition: this.implicit(4).use(Simple256Condition)
  })
})


var PreimageFulfillment = asn.define('PreimageFulfillment', function () {
  this.seq().obj(
    this.key('preimage').implicit(0).octstr()
  )
})

var PrefixFulfillment = asn.define('PrefixFulfillment', function () {
  this.seq().obj(
    this.key('prefix').implicit(0).octstr(),
    this.key('maxMessageLength').implicit(1).int(),
    this.key('subfulfillment').explicit(2).use(Fulfillment)
  )
})

var ThresholdFulfillment = asn.define('ThresholdFulfillment', function () {
  this.seq().obj(
    this.key('subfulfillments').implicit(0).setof(Fulfillment),
    this.key('subconditions').implicit(1).setof(Condition)
  )
})

var RsaSha256Fulfillment = asn.define('RsaSha256Fulfillment', function () {
  this.seq().obj(
    this.key('modulus').implicit(0).octstr(),
    this.key('signature').implicit(1).octstr()
  )
})

var Ed25519Sha256Fulfillment = asn.define('Ed25519Sha256Fulfillment', function () {
  this.seq().obj(
    this.key('publicKey').implicit(0).octstr(),
    this.key('signature').implicit(1).octstr()
  )
})

var Fulfillment = asn.define('Fulfillment', function () {
  this.choice({
    preimageSha256Fulfillment: this.implicit(0).use(PreimageFulfillment),
    prefixSha256Fulfillment: this.implicit(1).use(PrefixFulfillment),
    thresholdSha256Fulfillment: this.implicit(2).use(ThresholdFulfillment),
    rsaSha256Fulfillment: this.implicit(3).use(RsaSha256Fulfillment),
    ed25519Sha256Fulfillment: this.implicit(4).use(Ed25519Sha256Fulfillment)
  })
})

module.exports = {
  Simple256Condition: Simple256Condition, 
  Compound256Condition: Compound256Condition,
  Condition: Condition,
  PreimageFulfillment: PreimageFulfillment,
  PrefixFulfillment: PrefixFulfillment,
  ThresholdFulfillment: ThresholdFulfillment,
  RsaSha256Fulfillment: RsaSha256Fulfillment,
  Ed25519Sha256Fulfillment: Ed25519Sha256Fulfillment,
  Fulfillment: Fulfillment
}