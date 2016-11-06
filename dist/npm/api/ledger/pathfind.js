
'use strict';
var _ = require('lodash');
var async = require('async');
var BigNumber = require('bignumber.js');
var utils = require('./utils');
var validate = utils.common.validate;
var parsePathfind = require('./parse/pathfind');
var NotFoundError = utils.common.errors.NotFoundError;
var composeAsync = utils.common.composeAsync;
var convertErrors = utils.common.convertErrors;

function addParams(params, result) {
  return _.assign({}, result, {
    source_account: params.src_account,
    source_currencies: params.src_currencies,
    destination_amount: params.dst_amount
  });
}

function requestPathFind(remote, pathfind, callback) {
  var params = {
    src_account: pathfind.source.address,
    dst_account: pathfind.destination.address,
    dst_amount: utils.common.toRippledAmount(pathfind.destination.amount)
  };
  if (typeof params.dst_amount === 'object' && !params.dst_amount.issuer) {
    // Convert blank issuer to sender's address
    // (Ripple convention for 'any issuer')
    // https://ripple.com/build/transactions/
    //     #special-issuer-values-for-sendmax-and-amount
    // https://ripple.com/build/ripple-rest/#counterparties-in-payments
    params.dst_amount.issuer = params.dst_account;
  }
  if (pathfind.source.currencies && pathfind.source.currencies.length > 0) {
    params.src_currencies = pathfind.source.currencies.map(function (amount) {
      return _.omit(utils.common.toRippledAmount(amount), 'value');
    });
  }

  remote.createPathFind(params, composeAsync(_.partial(addParams, params), convertErrors(callback)));
}

function addDirectXrpPath(paths, xrpBalance) {
  // Add XRP "path" only if the source acct has enough XRP to make the payment
  var destinationAmount = paths.destination_amount;
  if (new BigNumber(xrpBalance).greaterThanOrEqualTo(destinationAmount)) {
    paths.alternatives.unshift({
      paths_computed: [],
      source_amount: paths.destination_amount
    });
  }
  return paths;
}

function isRippledIOUAmount(amount) {
  // rippled XRP amounts are specified as decimal strings
  return typeof amount === 'object' && amount.currency && amount.currency !== 'XRP';
}

function conditionallyAddDirectXRPPath(remote, address, paths, callback) {
  if (isRippledIOUAmount(paths.destination_amount) || !_.includes(paths.destination_currencies, 'XRP')) {
    callback(null, paths);
  } else {
    utils.getXRPBalance(remote, address, undefined, composeAsync(_.partial(addDirectXrpPath, paths), callback));
  }
}

function formatResponse(pathfind, paths) {
  if (paths.alternatives && paths.alternatives.length > 0) {
    var _address = pathfind.source.address;
    return parsePathfind(_address, pathfind.destination.amount, paths);
  }
  if (paths.destination_currencies !== undefined && !_.includes(paths.destination_currencies, pathfind.destination.amount.currency)) {
    throw new NotFoundError('No paths found. ' + 'The destination_account does not accept ' + pathfind.destination.amount.currency + ', they only accept: ' + paths.destination_currencies.join(', '));
  } else if (paths.source_currencies && paths.source_currencies.length > 0) {
    throw new NotFoundError('No paths found. Please ensure' + ' that the source_account has sufficient funds to execute' + ' the payment in one of the specified source_currencies. If it does' + ' there may be insufficient liquidity in the network to execute' + ' this payment right now');
  } else {
    throw new NotFoundError('No paths found.' + ' Please ensure that the source_account has sufficient funds to' + ' execute the payment. If it does there may be insufficient liquidity' + ' in the network to execute this payment right now');
  }
}

function getPathsAsync(pathfind, callback) {
  validate.pathfind(pathfind);

  var address = pathfind.source.address;
  async.waterfall([_.partial(requestPathFind, this.remote, pathfind), _.partial(conditionallyAddDirectXRPPath, this.remote, address)], composeAsync(_.partial(formatResponse, pathfind), callback));
}

function getPaths(pathfind) {
  return utils.promisify(getPathsAsync).call(this, pathfind);
}

module.exports = getPaths;