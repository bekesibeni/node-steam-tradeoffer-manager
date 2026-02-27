'use strict';

// CJS backwards-compatibility shim.
// Makes `require('steam-tradeoffer-manager')` return the TradeOfferManager class directly,
// while still exposing all named exports as properties on it.
const m = require('./dist/index.js');
module.exports = m.TradeOfferManager;
Object.assign(module.exports, m);
