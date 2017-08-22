## 1.2.5
+ Make orderbook limit configurable.
+ Update Bignumber.js to v4.0.2
+ fallback to ws0.8.1

## 1.2.4
+ ADD escrow transactions, remove suspays.
+ ADD utils for cryto-conditions
+ upgrade to ws2.2.0

## 1.2.3
+ Allow transaction._maxFee to overwrite TxnManager's.
+ Some changes on server._score computation, and reconnection.
+ Account.lines to request complete trustlines with iterating call.
+ Add account.offers method

## 1.2.2
+ Remove dependency on ripple-wallet-generator
+ FIX some minor bugs

## 1.2.1
+ ADD suspay transactions
+ ADD gateway_balances request
+ FIX server load monitoring

## 1.2.0

+ ADD accountListener object
+ Remove 'tejMaxFeeExceeded' code
+ Modify the resubmission flow of TransactionManager
+ more complete functions for KeyPair and Seed, e.g. support RFC1751 format.


## 1.1.3

+ Remove duplicate tx flags

## 1.1.2

+ FIX server disconnect bug.
+ Add filterFn to transaction broadcast.


## 1.1.1

+ FIX reserve computation bug.
+ FIX account.entry updating, and include signerlist info.
+ ADD signerListSet method on Transaction

## 1.1.0

+ ADD support for multi-signature
+ ADD cache keypairs
+ FIX ripple_state parsing


## 1.0.0

+ Clone from ripple-lib 0.12.9
+ Re-organize and cleanup
