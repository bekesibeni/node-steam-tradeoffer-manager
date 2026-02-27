"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeOfferManager = exports.ETradeStatus = exports.EConfirmationMethod = exports.EResult = exports.EOfferFilter = exports.ETradeOfferState = exports.SteamID = void 0;
const events_1 = require("events");
const fs_1 = require("fs");
const Path = __importStar(require("path"));
const Zlib = __importStar(require("zlib"));
const data_structures_1 = require("@doctormckay/stdlib/data_structures");
const os_1 = require("@doctormckay/stdlib/os");
const languages_1 = require("languages");
const steamcommunity_1 = require("steamcommunity");
const steamid_1 = __importDefault(require("steamid"));
exports.SteamID = steamid_1.default;
const ETradeOfferState_1 = require("./resources/ETradeOfferState");
Object.defineProperty(exports, "ETradeOfferState", { enumerable: true, get: function () { return ETradeOfferState_1.ETradeOfferState; } });
const EOfferFilter_1 = require("./resources/EOfferFilter");
Object.defineProperty(exports, "EOfferFilter", { enumerable: true, get: function () { return EOfferFilter_1.EOfferFilter; } });
const EResult_1 = require("./resources/EResult");
Object.defineProperty(exports, "EResult", { enumerable: true, get: function () { return EResult_1.EResult; } });
const EConfirmationMethod_1 = require("./resources/EConfirmationMethod");
Object.defineProperty(exports, "EConfirmationMethod", { enumerable: true, get: function () { return EConfirmationMethod_1.EConfirmationMethod; } });
const ETradeStatus_1 = require("./resources/ETradeStatus");
Object.defineProperty(exports, "ETradeStatus", { enumerable: true, get: function () { return ETradeStatus_1.ETradeStatus; } });
// ─── Main class ───────────────────────────────────────────────────────────────
class TradeOfferManager extends events_1.EventEmitter {
    // ── Static enum references (mirrors original static props) ────────────────
    static SteamID = steamid_1.default;
    static ETradeOfferState = ETradeOfferState_1.ETradeOfferState;
    static EOfferFilter = EOfferFilter_1.EOfferFilter;
    static EResult = EResult_1.EResult;
    static EConfirmationMethod = EConfirmationMethod_1.EConfirmationMethod;
    static ETradeStatus = ETradeStatus_1.ETradeStatus;
    // ── Public instance state ─────────────────────────────────────────────────
    steamID = null;
    apiKey = null;
    accessToken = null;
    useAccessToken;
    pollData;
    pollInterval;
    minimumPollInterval;
    pollFullUpdateInterval;
    cancelTime;
    pendingCancelTime;
    cancelOfferCount;
    cancelOfferCountMinAge;
    // ── Internal state ─────────────────────────────────────────────────────────
    _steam;
    _community;
    _domain;
    _language;
    _languageName;
    _pollTimer = null;
    _lastPoll = 0;
    _lastPollFullUpdate = 0;
    _pendingOfferSendResponses = 0;
    _dataGzip;
    _dataDirectory = null;
    _assetCache;
    _getPollDataFromDisk;
    constructor(options = {}) {
        super();
        this._steam = options.steam ?? null;
        this._domain = options.domain ?? 'localhost';
        this._language = null;
        this._languageName = null;
        if (this._domain === 'doctormckay.com' && !process.env['MCKAY_BOX']) {
            throw new Error("Please fill in your own domain. I'm pretty sure you don't own doctormckay.com.");
        }
        this._community = options.community ?? new steamcommunity_1.SteamCommunity();
        this._dataGzip = options.gzipData ?? false;
        const assetCacheSize = options.assetCacheMaxItems ?? 500;
        const assetCacheGcInterval = options.assetCacheGcInterval ?? 120_000;
        if (options.globalAssetCache) {
            global['_steamTradeOfferManagerAssetCache'] ??=
                new data_structures_1.LeastUsedCache(assetCacheSize, assetCacheGcInterval);
            this._assetCache = global['_steamTradeOfferManagerAssetCache'];
        }
        else {
            this._assetCache = new data_structures_1.LeastUsedCache(assetCacheSize, assetCacheGcInterval);
        }
        // Disk persistence
        let dataDir = options.dataDirectory;
        if (dataDir === undefined) {
            if (process.env['OPENSHIFT_DATA_DIR']) {
                dataDir = process.env['OPENSHIFT_DATA_DIR'] + '/node-steam-tradeoffer-manager';
            }
            else {
                dataDir = (0, os_1.appDataDirectory)({ appName: 'node-steam-tradeoffer-manager', appAuthor: 'doctormckay' });
            }
        }
        if (dataDir) {
            this._dataDirectory = dataDir;
            fs_1.promises.mkdir(dataDir, { recursive: true }).catch(() => undefined);
        }
        this.pollInterval = options.pollInterval ?? 30_000;
        this.minimumPollInterval = options.minimumPollInterval ?? 1_000;
        this.pollFullUpdateInterval = options.pollFullUpdateInterval ?? 120_000;
        this.cancelTime = options.cancelTime;
        this.pendingCancelTime = options.pendingCancelTime;
        this.cancelOfferCount = options.cancelOfferCount;
        this.cancelOfferCountMinAge = options.cancelOfferCountMinAge ?? 0;
        // Sanity-check poll intervals
        const sanityChecks = {
            pollInterval: 1_000,
            minimumPollInterval: 1_000,
            pollFullUpdateInterval: 1_000,
        };
        for (const [key, min] of Object.entries(sanityChecks)) {
            const val = this[key];
            if (key === 'pollInterval' && val < 0)
                continue;
            if (val < min) {
                this._warn(`Option ${key} failed sanity check: provided value (${val}) is too low. ${key} has been forced to ${min}.`);
                this[key] = min;
            }
        }
        this.pollData = options.pollData ?? {};
        this.useAccessToken = options.useAccessToken !== false;
        // Language mapping
        if (options.language) {
            const lang = options.language;
            if (lang === 'szh') {
                this._language = 'zh';
                this._languageName = 'schinese';
            }
            else if (lang === 'tzh') {
                this._language = 'zh';
                this._languageName = 'tchinese';
            }
            else if (lang === 'br') {
                this._language = 'pt-BR';
                this._languageName = 'brazilian';
            }
            else {
                const info = (0, languages_1.getLanguageInfo)(lang);
                if (!info.name) {
                    this._language = null;
                    this._languageName = null;
                }
                else {
                    this._language = lang;
                    this._languageName = info.name.toLowerCase();
                }
            }
        }
        // Steam-user event hooks
        if (this._steam) {
            this._steam.on('tradeOffers', () => { this.doPoll(); });
            this._steam.on('newItems', () => { this.doPoll(); });
        }
        // Auto-save poll data
        if (options.savePollData) {
            this._getPollDataFromDisk = true;
            this.on('pollData', (pollData) => {
                if (this.steamID) {
                    this._persistToDisk('polldata_' + this.steamID + '.json', JSON.stringify(pollData));
                }
            });
        }
    }
    // ─── Cookie / session setup ───────────────────────────────────────────────
    setCookies(cookies, familyViewPin, callback) {
        if (typeof familyViewPin === 'function') {
            callback = familyViewPin;
            familyViewPin = null;
        }
        try {
            const loginSecureCookie = cookies.find((c) => c.startsWith('steamLoginSecure='));
            if (!loginSecureCookie)
                throw new Error('steamLoginSecure cookie not found');
            const match = loginSecureCookie.match(/steamLoginSecure=([^;]+)/);
            if (!match)
                throw new Error('steamLoginSecure cookie is malformed');
            const cookieValue = decodeURIComponent(match[1].trim());
            const accessToken = cookieValue.split('||')[1];
            if (!accessToken)
                throw new Error('Access token not found');
            this.accessToken = accessToken;
        }
        catch (ex) {
            if (this.useAccessToken) {
                callback?.(ex);
                return;
            }
        }
        this._community.setCookies(cookies);
        this.steamID = this._community.steamID;
        if (this._getPollDataFromDisk) {
            delete this._getPollDataFromDisk;
            const filename = 'polldata_' + this.steamID + '.json';
            this._getFromDisk([filename], (_err, files) => {
                if (files[filename]) {
                    try {
                        this.pollData = JSON.parse(files[filename].toString('utf8'));
                    }
                    catch (ex) {
                        this.emit('debug', 'Error parsing poll data from disk: ' + ex.message);
                    }
                }
            });
        }
        const finish = (err) => {
            let hadError = !!err;
            if (hadError && err.message === 'No API key created for this account' && this.accessToken) {
                hadError = false;
                if (!this.useAccessToken) {
                    this._warn('An API key has not been created for this account; access token will be used instead for API requests.' +
                        '\n    For more information, see: https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/wiki/Access-Tokens' +
                        '\n    To disable this warning, create an API key or set useAccessToken to true in TradeOfferManager options.');
                }
            }
            if (hadError) {
                callback?.(err);
                return;
            }
            if (this._languageName) {
                this._community.setCookies(['Steam_Language=' + this._languageName]);
            }
            clearTimeout(this._pollTimer ?? undefined);
            if (this.pollInterval >= 0) {
                this.doPoll();
            }
            callback?.(null);
        };
        if (familyViewPin) {
            this.parentalUnlock(familyViewPin, (err) => {
                if (err) {
                    callback?.(err);
                    return;
                }
                if (this.accessToken && this.useAccessToken) {
                    finish();
                }
                else {
                    this._checkApiKey(finish);
                }
            });
        }
        else {
            if (this.accessToken && this.useAccessToken) {
                finish();
            }
            else {
                this._checkApiKey(finish);
            }
        }
    }
    shutdown() {
        clearTimeout(this._pollTimer ?? undefined);
        this._community = new steamcommunity_1.SteamCommunity();
        this._steam = null;
        this.apiKey = null;
        this.accessToken = null;
    }
    parentalUnlock(pin, callback) {
        this._community.parentalUnlock(pin, (err) => { callback?.(err ?? null); });
    }
    _checkApiKey(callback) {
        if (this.apiKey) {
            callback();
            return;
        }
        // First arg is the "unused" domain param (kept for backward compat in steamcommunity)
        this._community.getWebApiKey(null, (err, key) => {
            if (err) {
                callback(err);
                return;
            }
            this.apiKey = key ?? null;
            callback();
        });
    }
    // ─── Disk persistence ─────────────────────────────────────────────────────
    _persistToDisk(filename, content) {
        if (!this._dataDirectory)
            return;
        const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
        const filePath = Path.join(this._dataDirectory, filename);
        if (this._dataGzip) {
            Zlib.gzip(buf, (err, data) => {
                if (err) {
                    this.emit('debug', `Cannot gzip ${filename}: ${err.message}`);
                }
                else {
                    fs_1.promises.writeFile(filePath + '.gz', data).catch((e) => {
                        this.emit('debug', `Cannot write ${filename}.gz: ${e.message}`);
                    });
                }
            });
        }
        else {
            fs_1.promises.writeFile(filePath, buf).catch((e) => {
                this.emit('debug', `Cannot write ${filename}: ${e.message}`);
            });
        }
    }
    _getFromDisk(filenames, callback) {
        if (!this._dataDirectory) {
            callback(null, {});
            return;
        }
        const requestedFilenames = this._dataGzip ? filenames.map((n) => n + '.gz') : filenames;
        const readPromises = requestedFilenames.map((filename) => fs_1.promises.readFile(Path.join(this._dataDirectory, filename))
            .then((contents) => ({ filename, contents }))
            .catch(() => null));
        Promise.all(readPromises).then((results) => {
            const files = {};
            for (const file of results) {
                if (file?.contents)
                    files[file.filename] = file.contents;
            }
            if (!this._dataGzip) {
                callback(null, files);
                return;
            }
            const keys = Object.keys(files);
            if (keys.length === 0) {
                callback(null, {});
                return;
            }
            const gunzipped = {};
            let pending = keys.length;
            for (const filename of keys) {
                Zlib.gunzip(files[filename], (gunzipErr, data) => {
                    if (!gunzipErr)
                        gunzipped[filename] = data;
                    if (--pending === 0) {
                        const renamed = {};
                        for (const [k, v] of Object.entries(gunzipped)) {
                            renamed[k.replace(/\.gz$/, '')] = v;
                        }
                        callback(null, renamed);
                    }
                });
            }
        }).catch((err) => callback(err, {}));
    }
    // ─── Inventory helpers ────────────────────────────────────────────────────
    getInventoryContents(appid, contextid, tradableOnly, callback) {
        if (!this.steamID) {
            callback(new Error('Not Logged In'));
            return;
        }
        this.getUserInventoryContents(this.steamID, appid, contextid, tradableOnly, callback);
    }
    getUserInventoryContents(sid, appid, contextid, tradableOnly, callback) {
        this._community.getUserInventoryContents(sid, appid, contextid, tradableOnly, this._languageName ?? 'english', callback);
    }
    getOfferToken(callback) {
        this._community.getTradeURL((err, _url, token) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, token);
        });
    }
    getOffersContainingItems(items, includeInactive, callback) {
        if (typeof includeInactive === 'function') {
            callback = includeInactive;
            includeInactive = false;
        }
        const itemArray = Array.isArray(items) ? items : [items];
        this.getOffers(includeInactive ? EOfferFilter_1.EOfferFilter.All : EOfferFilter_1.EOfferFilter.ActiveOnly, (err, sent, received) => {
            if (err) {
                callback(err);
                return;
            }
            const filterFunc = (offer) => itemArray.some((item) => this._itemEquals(offer, item));
            callback(null, sent.filter(filterFunc), received.filter(filterFunc));
        });
    }
    // ─── Internal utility ─────────────────────────────────────────────────────
    _notifySessionExpired(err) {
        this.emit('sessionExpired', err);
        this._community._notifySessionExpired(err);
    }
    _warn(msg) {
        process.emitWarning(msg, 'Warning', 'steam-tradeoffer-manager');
    }
    // Internal helper used by getOffersContainingItems
    _itemEquals(offer, item) {
        return offer.containsItem(item);
    }
}
exports.TradeOfferManager = TradeOfferManager;
//# sourceMappingURL=TradeOfferManager.js.map