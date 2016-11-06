
'use strict';
var _ = require('lodash');
var parseAmount = require('./amount');

function parsePaths(paths) {
  return paths.map(function (steps) {
    return steps.map(function (step) {
      return _.omit(step, ['type', 'type_hex']);
    });
  });
}

function parsePathfind(sourceAddress, destinationAmount, pathfindResult) {
  return pathfindResult.alternatives.map(function (alternative) {
    return {
      source: {
        address: sourceAddress,
        maxAmount: parseAmount(alternative.source_amount)
      },
      destination: {
        address: pathfindResult.destination_account,
        amount: destinationAmount
      },
      paths: JSON.stringify(parsePaths(alternative.paths_computed))
    };
  });
}

module.exports = parsePathfind;