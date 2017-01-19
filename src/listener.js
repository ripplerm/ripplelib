var util = require('util');
var EventEmitter = require('events').EventEmitter;

// =================================================================

function Listener (account) {
	EventEmitter.call(this);

	var self = this;

	this._account = account;
	this._accountID = account._account_id;
	this._remote = account._remote;
	this._minLedger = null;
	this._marker = null;

	function handleLedgerClosed (ledger) {
		if (ledger.ledger_index <= self._minLedger) return;
		self._minLedger = ledger.ledger_index;
		self.emit('ledger_closed', ledger);
	}

	function handleReconnect() {
		self._handleReconnect(function() {
		  // Handle reconnect, account_tx procedure first, before
		  // hooking back into ledger_closed
		  self._remote.on('ledger_closed', handleLedgerClosed);
		  self.emit('reconnected');
		});
	}

	this._remote.on('ledger_closed', handleLedgerClosed)

	this._remote.on('disconnect', function () {
		self._remote.removeListener('ledger_closed', handleLedgerClosed);
	    self._remote.once('connect', handleReconnect);
	});

	this._account.on('transaction', function(res) {
    	self._transactionReceived(res);
	});
}
util.inherits(Listener, EventEmitter);

/**
 * On reconnect, load account_tx to capture missed tx while disconnected
 *
 * @param [Function] callback
 * @api private
 */
Listener.prototype._handleReconnect = function (callback){
	if (typeof callback != 'function') callback = function(){};
	var self = this;

	var minLedger = this._minLedger;

	var options = {
	    account: this._accountID,
	    ledger_index_min: minLedger || -1,
	    ledger_index_max: -1,
	    binary: true,
	    parseBinary: true,
	    limit: 20, 
	    forward: (minLedger > 0) ? true : false
  	};

	function handleTransactions(err, transactions) {
	    if (err || typeof transactions !== 'object') {
      		callback();	    	
	      	return;
	    }

	    if (Array.isArray(transactions.transactions)) {
	    	// sort the transactions in forward order
	      	if (! options.forward) {
		        transactions.transactions.sort(function(a,b){
		          return a.tx.Sequence - b.tx.Sequence;
		        })
	      	}	    	
	      	// Treat each transaction in account transaction history as received
	      	transactions.transactions.forEach(self._transactionReceived, self);
	    }

		if (options.forward && transactions.marker) {
		  	options.marker = transactions.marker;
		  	self._remote.requestAccountTx(options, handleTransactions);
		} else {
		  	callback();  
		}
	}

	this._remote.requestAccountTx(options, handleTransactions);
}

/**
 * Handle received transaction
 *
 * @param {Object} transaction
 * @api private
 */
Listener.prototype._transactionReceived = function (tx) {
	var transaction = Listener.normalizeTransaction(tx);
	var self = this;

	if (!transaction.validated) return;

	// filter out txns older than last-received.
	var marker = Listener.markerString(transaction);
	if (marker < this._marker) return;

	var account = transaction.tx_json.Account;

	if (transaction.tx_json.Memos && transaction.tx_json.Memos.length) {
		this.emit(account == this._accountID ? 'memo-out' : 'memo-in', transaction);
	}

	if (transaction.tx_json.TransactionType == 'Payment') {
		this.emit(account == this._accountID ? 'payment-out' : 'payment-in', transaction);
	}

	this.emit(account == this._accountID ? 'transaction-outbound' : 'transaction-inbound', transaction);

	this._marker = marker;
	this._minLedger = transaction.ledger_index;
}

Listener.markerString = function (tx) {
	function toHex (num) { return ("00000000" + num.toString(16)).substr(-8); }
	return toHex(tx.ledger_index) + toHex(tx.metadata.TransactionIndex);
}

/**
 * Normalize transactions received from
 * account transaction stream and account_tx
 *
 * @param {Transaction}
 * @return {Transaction} normalized
 * @api private
 */

Listener.normalizeTransaction = function(tx) {
  var transaction = { };
  var keys = Object.keys(tx);

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    switch (k) {
      case 'transaction':
        // Account transaction stream
        transaction.tx_json = tx[k];
        break;
      case 'tx':
        // account_tx response
        transaction.engine_result = tx.meta.TransactionResult;
        transaction.result = transaction.engine_result;
        transaction.tx_json = tx[k];
        transaction.hash = tx[k].hash;
        transaction.ledger_index = tx[k].ledger_index;
        transaction.type = 'transaction';
        transaction.validated = tx.validated;
        break;
      case 'meta':
      case 'metadata':
        transaction.metadata = tx[k];
        break;
      case 'mmeta':
        // Don't copy mmeta
        break;
      default:
        transaction[k] = tx[k];
    }
  }

  if (transaction.metadata) {
	switch (typeof transaction.metadata.DeliveredAmount) {
	case 'string':
	case 'object':
	  transaction.metadata.delivered_amount = transaction.metadata.DeliveredAmount;
	  break;
	default:
	  switch (typeof transaction.tx_json.Amount) {
	    case 'string':
	    case 'object':
	      transaction.metadata.delivered_amount = transaction.tx_json.Amount;
	      break;
	  }
	}
  }

  transaction.normalized = true;
  return transaction;
};

module.exports = Listener;