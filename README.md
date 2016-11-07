#ripplelib

A JavaScript API for interacting with Ripple in Node.js and the browser
(a fork from ripple-lib-0.12)

##Features

+ Connect to a rippled server in JavaScript (Node.js or browser)
+ Issue [rippled API](https://ripple.com/build/rippled-apis/) requests
+ Listen to events on the Ripple network (transaction, ledger, etc.)
+ Sign and submit transactions to the Ripple network


##Installation

**Via npm for Node.js**

```
  $ npm install ripplelib
```

**Building ripplelib for browser environments**

ripplelib uses Gulp to generate browser builds. These steps will generate minified and non-minified builds of ripplelib in the `build/` directory.

```
  $ git clone https://github.com/ripplerm/ripplelib
  $ npm install
  $ npm run build
```

**Restricted browser builds**

You may generate browser builds that contain a subset of features. To do this, run `./node_modules/.bin/gulp build-<name>`

+ `build-core` Contains the functionality to make requests and listen for events such as `ledgerClose`. Only `ripple.Remote` is currently exposed. Advanced features like transaction submission and orderbook tracking are excluded from this build.

##Quick start

`Remote.js` ([remote.js](https://github.com/ripplerm/ripplelib/blob/master/dist/npm/remote.js)) is the point of entry for interacting with rippled

```js
/* Loading ripplelib with Node.js */
var Remote = require('ripplelib').Remote;

/* Loading ripplelib in a webpage */
// var Remote = ripple.Remote;

var remote = new Remote({
  // see the API Reference for available options
  servers: [ 'wss://s1.ripple.com:443' ]
});

remote.connect(function() {
  /* remote connected */
  remote.requestServerInfo(function(err, info) {
    // process err and info
  });
});
```

##Running tests

1. Clone the repository

2. `cd` into the repository and install dependencies with `npm install`

3. `npm test`

##More Information

+ [Ripple Dev Portal](https://ripple.com/build/)