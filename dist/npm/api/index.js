

'use strict';
var _ = require('lodash');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var common = require('./common');
var server = require('./server/server');
var connect = server.connect;
var disconnect = server.disconnect;
var getServerInfo = server.getServerInfo;
var getFee = server.getFee;
var isConnected = server.isConnected;
var getLedgerVersion = server.getLedgerVersion;
var getTransaction = require('./ledger/transaction');
var getTransactions = require('./ledger/transactions');
var getTrustlines = require('./ledger/trustlines');
var getBalances = require('./ledger/balances');
var getPaths = require('./ledger/pathfind');
var getOrders = require('./ledger/orders');
var getOrderbook = require('./ledger/orderbook');
var getSettings = require('./ledger/settings');
var getAccountInfo = require('./ledger/accountinfo');
var preparePayment = require('./transaction/payment');
var prepareTrustline = require('./transaction/trustline');
var prepareOrder = require('./transaction/order');
var prepareOrderCancellation = require('./transaction/ordercancellation');
var prepareSuspendedPaymentCreation = require('./transaction/suspended-payment-creation');
var prepareSuspendedPaymentExecution = require('./transaction/suspended-payment-execution');
var prepareSuspendedPaymentCancellation = require('./transaction/suspended-payment-cancellation');
var prepareSettings = require('./transaction/settings');
var sign = require('./transaction/sign');
var submit = require('./transaction/submit');
var errors = require('./common').errors;
var convertExceptions = require('./common').convertExceptions;
var generateAddress = convertExceptions(common.generateAddress);
var computeLedgerHash = require('./offline/ledgerhash');
var getLedger = require('./ledger/ledger');

function RippleAPI(options) {
  var _this = this;

  common.validate.remoteOptions(options);
  if (EventEmitter instanceof Function) {
    // always true, needed for flow
    EventEmitter.call(this);
  }
  var _options = _.assign({}, options, { automatic_resubmission: false });
  this.remote = new common.core.Remote(_options);
  this.remote.on('ledger_closed', function (message) {
    _this.emit('ledgerClosed', server.formatLedgerClose(message));
  });
}

util.inherits(RippleAPI, EventEmitter);

_.assign(RippleAPI.prototype, {
  connect: connect,
  disconnect: disconnect,
  isConnected: isConnected,
  getServerInfo: getServerInfo,
  getFee: getFee,
  getLedgerVersion: getLedgerVersion,

  getTransaction: getTransaction,
  getTransactions: getTransactions,
  getTrustlines: getTrustlines,
  getBalances: getBalances,
  getPaths: getPaths,
  getOrders: getOrders,
  getOrderbook: getOrderbook,
  getSettings: getSettings,
  getAccountInfo: getAccountInfo,
  getLedger: getLedger,

  preparePayment: preparePayment,
  prepareTrustline: prepareTrustline,
  prepareOrder: prepareOrder,
  prepareOrderCancellation: prepareOrderCancellation,
  prepareSuspendedPaymentCreation: prepareSuspendedPaymentCreation,
  prepareSuspendedPaymentExecution: prepareSuspendedPaymentExecution,
  prepareSuspendedPaymentCancellation: prepareSuspendedPaymentCancellation,
  prepareSettings: prepareSettings,
  sign: sign,
  submit: submit,

  generateAddress: generateAddress,
  errors: errors
});

// these are exposed only for use by unit tests; they are not part of the API
RippleAPI._PRIVATE = {
  common: common,
  computeLedgerHash: computeLedgerHash,
  ledgerUtils: require('./ledger/utils'),
  schemaValidator: require('./common/schema-validator')
};

module.exports = RippleAPI;