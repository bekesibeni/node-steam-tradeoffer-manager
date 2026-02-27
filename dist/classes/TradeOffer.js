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
exports.TradeOffer = void 0;
const vm = __importStar(require("vm"));
const steamid_1 = __importDefault(require("steamid"));
const ETradeOfferState_1 = require("../resources/ETradeOfferState");
const EConfirmationMethod_1 = require("../resources/EConfirmationMethod");
const ETradeStatus_1 = require("../resources/ETradeStatus");
const helpers_1 = require("../helpers");
class TradeOffer {
    // ── Public properties ─────────────────────────────────────────────────────
    partner;
    id = null;
    message = null;
    state = ETradeOfferState_1.ETradeOfferState.Invalid;
    itemsToGive = [];
    itemsToReceive = [];
    isOurOffer = null;
    created = null;
    updated = null;
    expires = null;
    tradeID = null;
    fromRealTimeTrade = null;
    confirmationMethod = null;
    escrowEnds = null;
    rawJson = '';
    constructor(manager, partner, token) {
        if (typeof partner === 'string') {
            this.partner = new steamid_1.default(partner);
        }
        else {
            this.partner = partner;
        }
        if (!this.partner.isValid || !this.partner.isValid() || this.partner.type !== steamid_1.default.Type.INDIVIDUAL) {
            throw new Error('Invalid input SteamID ' + this.partner);
        }
        // Use Object.defineProperties to keep internal props non-enumerable
        // (so they don't appear in JSON.stringify / for...in)
        Object.defineProperties(this, {
            _countering: { configurable: true, enumerable: false, writable: true, value: null },
            _tempData: { configurable: true, enumerable: false, writable: true, value: {} },
            _token: { configurable: true, enumerable: false, writable: true, value: token },
            manager: { configurable: false, enumerable: false, writable: false, value: manager },
        });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Public methods
    // ─────────────────────────────────────────────────────────────────────────
    isGlitched() {
        if (!this.id)
            return false;
        if (this.itemsToGive.length + this.itemsToReceive.length === 0)
            return true;
        if (this.manager._language && this.itemsToGive.concat(this.itemsToReceive).some((item) => !item.name)) {
            return true;
        }
        return false;
    }
    containsItem(item) {
        return this.itemsToGive.concat(this.itemsToReceive).some((offerItem) => (0, helpers_1.itemEquals)(offerItem, item));
    }
    data(...args) {
        const pollData = this.manager.pollData;
        if (args.length === 0) {
            if (!this.id)
                return this._tempData;
            return (pollData.offerData && pollData.offerData[this.id]) ?? {};
        }
        const [key, value] = args;
        if (args.length === 1) {
            if (!this.id)
                return this._tempData[key];
            return pollData.offerData?.[this.id]?.[key];
        }
        // Setting value
        if (key === 'cancelTime') {
            if (!this.isOurOffer) {
                throw new Error(`Cannot set cancelTime for offer #${this.id} as we did not send it.`);
            }
            if (this.id &&
                this.state !== ETradeOfferState_1.ETradeOfferState.Active &&
                this.state !== ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation) {
                throw new Error(`Cannot set cancelTime for offer #${this.id} as it is not active (${ETradeOfferState_1.ETradeOfferState[this.state]}).`);
            }
        }
        if (!this.id) {
            this._tempData[key] = value;
            return;
        }
        pollData.offerData = pollData.offerData ?? {};
        pollData.offerData[this.id] = pollData.offerData[this.id] ?? {};
        pollData.offerData[this.id][key] = value;
        this.manager.emit('pollData', pollData);
    }
    getPartnerInventoryContents(appid, contextid, callback) {
        this.manager.getUserInventoryContents(this.partner, appid, contextid, true, callback);
    }
    addMyItem(item) {
        return addItem(item, this, this.itemsToGive);
    }
    addMyItems(items) {
        let added = 0;
        for (const item of items) {
            if (this.addMyItem(item))
                added++;
        }
        return added;
    }
    removeMyItem(item) {
        if (this.id)
            throw new Error('Cannot remove items from an already-sent offer');
        for (let i = 0; i < this.itemsToGive.length; i++) {
            if ((0, helpers_1.itemEquals)(this.itemsToGive[i], item)) {
                this.itemsToGive.splice(i, 1);
                return true;
            }
        }
        return false;
    }
    removeMyItems(items) {
        let removed = 0;
        for (const item of items) {
            if (this.removeMyItem(item))
                removed++;
        }
        return removed;
    }
    addTheirItem(item) {
        return addItem(item, this, this.itemsToReceive);
    }
    addTheirItems(items) {
        let added = 0;
        for (const item of items) {
            if (this.addTheirItem(item))
                added++;
        }
        return added;
    }
    removeTheirItem(item) {
        if (this.id)
            throw new Error('Cannot remove items from an already-sent offer');
        for (let i = 0; i < this.itemsToReceive.length; i++) {
            if ((0, helpers_1.itemEquals)(this.itemsToReceive[i], item)) {
                this.itemsToReceive.splice(i, 1);
                return true;
            }
        }
        return false;
    }
    removeTheirItems(items) {
        let removed = 0;
        for (const item of items) {
            if (this.removeTheirItem(item))
                removed++;
        }
        return removed;
    }
    send(callback) {
        if (this.id) {
            (0, helpers_1.makeAnError)(new Error('This offer has already been sent'), callback);
            return;
        }
        if (this.itemsToGive.length + this.itemsToReceive.length === 0) {
            (0, helpers_1.makeAnError)(new Error('Cannot send an empty trade offer'), callback);
            return;
        }
        const itemMapper = (item) => ({
            appid: item['appid'],
            contextid: item['contextid'],
            amount: item['amount'] ?? 1,
            assetid: item['assetid'],
        });
        const offerdata = {
            newversion: true,
            version: this.itemsToGive.length + this.itemsToReceive.length + 1,
            me: {
                assets: this.itemsToGive.map((i) => itemMapper(i)),
                currency: [],
                ready: false,
            },
            them: {
                assets: this.itemsToReceive.map((i) => itemMapper(i)),
                currency: [],
                ready: false,
            },
        };
        const params = {};
        if (this._token)
            params['trade_offer_access_token'] = this._token;
        this.manager._pendingOfferSendResponses++;
        this.manager._community.httpRequestPost('https://steamcommunity.com/tradeoffer/new/send', {
            headers: {
                referer: `https://steamcommunity.com/tradeoffer/${this.id ?? 'new'}/?partner=${this.partner.accountid}` +
                    (this._token ? '&token=' + this._token : ''),
            },
            json: true,
            form: {
                sessionid: this.manager._community.getSessionID(),
                serverid: 1,
                partner: this.partner.toString(),
                tradeoffermessage: this.message ?? '',
                json_tradeoffer: JSON.stringify(offerdata),
                captcha: '',
                trade_offer_create_params: JSON.stringify(params),
                tradeofferid_countered: this._countering,
            },
            checkJsonError: false,
            checkHttpError: false,
        }, (err, response, body) => {
            const bObj = body;
            this.manager._pendingOfferSendResponses--;
            if (err) {
                (0, helpers_1.makeAnError)(err, callback);
                return;
            }
            if (response.statusCode !== 200) {
                if (response.statusCode === 401) {
                    this.manager._community._notifySessionExpired(new Error('HTTP error 401'));
                    (0, helpers_1.makeAnError)(new Error('Not Logged In'), callback);
                    return;
                }
                (0, helpers_1.makeAnError)(new Error('HTTP error ' + response.statusCode), callback, bObj);
                return;
            }
            if (!bObj) {
                (0, helpers_1.makeAnError)(new Error('Malformed JSON response'), callback);
                return;
            }
            if (bObj['strError']) {
                (0, helpers_1.makeAnError)(null, callback, bObj);
                return;
            }
            if (bObj['tradeofferid']) {
                this.id = bObj['tradeofferid'];
                this.state = ETradeOfferState_1.ETradeOfferState.Active;
                this.created = new Date();
                this.updated = new Date();
                this.expires = new Date(Date.now() + 1209600000);
                // Migrate local _tempData into persistent pollData
                for (const k in this._tempData) {
                    if (Object.prototype.hasOwnProperty.call(this._tempData, k)) {
                        this.manager.pollData.offerData = this.manager.pollData.offerData ?? {};
                        this.manager.pollData.offerData[this.id] = this.manager.pollData.offerData[this.id] ?? {};
                        this.manager.pollData.offerData[this.id][k] = this._tempData[k];
                    }
                }
                delete this['_tempData'];
            }
            this.confirmationMethod = EConfirmationMethod_1.EConfirmationMethod.None;
            if (bObj['needs_email_confirmation']) {
                this.state = ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation;
                this.confirmationMethod = EConfirmationMethod_1.EConfirmationMethod.Email;
            }
            if (bObj['needs_mobile_confirmation']) {
                this.state = ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation;
                this.confirmationMethod = EConfirmationMethod_1.EConfirmationMethod.MobileApp;
            }
            this.manager.pollData.sent = this.manager.pollData.sent ?? {};
            this.manager.pollData.sent[this.id] = this.state;
            this.manager.emit('pollData', this.manager.pollData);
            if (!callback)
                return;
            if (this.state === ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation) {
                callback(null, 'pending');
            }
            else if (bObj['tradeofferid']) {
                callback(null, 'sent');
            }
            else {
                callback(new Error('Unknown response'));
            }
        }, 'tradeoffermanager');
    }
    cancel(callback) {
        if (!this.id) {
            (0, helpers_1.makeAnError)(new Error('Cannot cancel or decline an unsent offer'), callback);
            return;
        }
        if (this.state !== ETradeOfferState_1.ETradeOfferState.Active &&
            this.state !== ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation) {
            (0, helpers_1.makeAnError)(new Error(`Offer #${this.id} is not active, so it may not be cancelled or declined`), callback);
            return;
        }
        this.manager._community.httpRequestPost(`https://steamcommunity.com/tradeoffer/${this.id}/${this.isOurOffer ? 'cancel' : 'decline'}`, {
            headers: {
                referer: `https://steamcommunity.com/tradeoffer/${this.id}/?partner=${this.partner.accountid}` +
                    (this._token ? '&token=' + this._token : ''),
            },
            json: true,
            form: { sessionid: this.manager._community.getSessionID() },
            checkJsonError: false,
            checkHttpError: false,
        }, (err, response, body) => {
            const bObj = body;
            if (err) {
                (0, helpers_1.makeAnError)(err, callback);
                return;
            }
            if (response.statusCode !== 200) {
                if (response.statusCode === 401) {
                    this.manager._community._notifySessionExpired(new Error('HTTP error 401'));
                    (0, helpers_1.makeAnError)(new Error('Not Logged In'), callback);
                    return;
                }
                (0, helpers_1.makeAnError)(new Error('HTTP error ' + response.statusCode), callback, bObj);
                return;
            }
            if (!bObj) {
                (0, helpers_1.makeAnError)(new Error('Malformed JSON response'), callback);
                return;
            }
            if (bObj['strError']) {
                (0, helpers_1.makeAnError)(null, callback, bObj);
                return;
            }
            if (bObj['tradeofferid'] !== this.id) {
                (0, helpers_1.makeAnError)(new Error('Wrong response'), callback);
                return;
            }
            this.state = this.isOurOffer ? ETradeOfferState_1.ETradeOfferState.Canceled : ETradeOfferState_1.ETradeOfferState.Declined;
            this.updated = new Date();
            callback?.(null);
            this.manager.doPoll();
        }, 'tradeoffermanager');
    }
    decline(callback) {
        return this.cancel(callback);
    }
    accept(skipStateUpdate, callback) {
        if (typeof skipStateUpdate === 'undefined')
            skipStateUpdate = false;
        if (typeof skipStateUpdate === 'function') {
            callback = skipStateUpdate;
            skipStateUpdate = false;
        }
        if (!this.id) {
            (0, helpers_1.makeAnError)(new Error('Cannot accept an unsent offer'), callback);
            return;
        }
        if (this.state !== ETradeOfferState_1.ETradeOfferState.Active) {
            (0, helpers_1.makeAnError)(new Error(`Offer #${this.id} is not active, so it may not be accepted`), callback);
            return;
        }
        if (this.isOurOffer) {
            (0, helpers_1.makeAnError)(new Error(`Cannot accept our own offer #${this.id}`), callback);
            return;
        }
        this.manager._community.httpRequestPost(`https://steamcommunity.com/tradeoffer/${this.id}/accept`, {
            headers: { Referer: `https://steamcommunity.com/tradeoffer/${this.id}/` },
            json: true,
            form: {
                sessionid: this.manager._community.getSessionID(),
                serverid: 1,
                tradeofferid: this.id,
                partner: this.partner.toString(),
                captcha: '',
            },
            checkJsonError: false,
            checkHttpError: false,
        }, (err, response, body) => {
            const bObj = body;
            if (err || response.statusCode !== 200) {
                if (response?.statusCode === 403) {
                    this.manager._community._notifySessionExpired(new Error('HTTP error 403'));
                    (0, helpers_1.makeAnError)(new Error('Not Logged In'), callback, bObj);
                }
                else {
                    (0, helpers_1.makeAnError)(err ?? new Error('HTTP error ' + response.statusCode), callback, bObj);
                }
                return;
            }
            if (!bObj) {
                (0, helpers_1.makeAnError)(new Error('Malformed JSON response'), callback);
                return;
            }
            if (bObj['strError']) {
                (0, helpers_1.makeAnError)(null, callback, bObj);
                return;
            }
            this.manager.doPoll();
            if (!callback)
                return;
            if (skipStateUpdate) {
                if (bObj['tradeid'])
                    this.tradeID = bObj['tradeid'];
                if (bObj['needs_mobile_confirmation'] || bObj['needs_email_confirmation']) {
                    callback(null, 'pending');
                }
                else {
                    callback(null, 'accepted');
                }
                return;
            }
            this.update((err) => {
                if (err) {
                    callback(new Error('Cannot load new trade data: ' + err.message));
                    return;
                }
                if (this.confirmationMethod !== null && this.confirmationMethod !== EConfirmationMethod_1.EConfirmationMethod.None) {
                    callback(null, 'pending');
                }
                else if (this.state === ETradeOfferState_1.ETradeOfferState.InEscrow) {
                    callback(null, 'escrow');
                }
                else if (this.state === ETradeOfferState_1.ETradeOfferState.Accepted) {
                    callback(null, 'accepted');
                }
                else {
                    callback(new Error('Unknown state ' + this.state));
                }
            });
        }, 'tradeoffermanager');
    }
    update(callback) {
        this.manager.getOffer(this.id, (err, offer) => {
            if (err) {
                callback(err);
                return;
            }
            const properties = ['id', 'state', 'expires', 'created', 'updated', 'escrowEnds', 'confirmationMethod', 'tradeID'];
            for (const key in offer) {
                if (Object.prototype.hasOwnProperty.call(offer, key) &&
                    typeof offer[key] !== 'function' &&
                    (properties.includes(key) || this.isGlitched())) {
                    this[key] = offer[key];
                }
            }
            callback(null);
        });
    }
    getReceivedItems(getActionsOrCallback, callback) {
        if (typeof getActionsOrCallback === 'function') {
            callback = getActionsOrCallback;
            getActionsOrCallback = false;
        }
        const getActions = getActionsOrCallback;
        if (!this.id) {
            (0, helpers_1.makeAnError)(new Error('Cannot request received items on an unsent offer'), callback);
            return;
        }
        if (this.state !== ETradeOfferState_1.ETradeOfferState.Accepted) {
            (0, helpers_1.makeAnError)(new Error(`Offer #${this.id} is not accepted, cannot request received items`), callback);
            return;
        }
        if (!this.tradeID) {
            (0, helpers_1.makeAnError)(new Error(`Offer #${this.id} is accepted, but does not have a trade ID`), callback);
            return;
        }
        this.manager._community.httpRequestGet(`https://steamcommunity.com/trade/${this.tradeID}/receipt/`, (err, response, body) => {
            if (err || response.statusCode !== 200) {
                (0, helpers_1.makeAnError)(err ?? new Error('HTTP error ' + response.statusCode), callback);
                return;
            }
            const bStr = body;
            const errorMatch = bStr.match(/<div id="error_msg">\s*([^<]+)\s*<\/div>/);
            if (errorMatch) {
                (0, helpers_1.makeAnError)(new Error(errorMatch[1].trim()), callback);
                return;
            }
            const script = bStr.match(/(var oItem;[\s\S]*)<\/script>/);
            if (!script) {
                if (bStr.length < 100 && bStr.match(/\{"success": ?false}/)) {
                    (0, helpers_1.makeAnError)(new Error('Not Logged In'), callback);
                    return;
                }
                (0, helpers_1.makeAnError)(new Error('Malformed response'), callback);
                return;
            }
            const items = [];
            vm.runInNewContext(script[1], {
                UserYou: null,
                BuildHover: (_str, item) => { items.push(item); },
                $: () => ({ show: () => undefined }),
            });
            if (items.length === 0 && this.itemsToReceive.length > 0) {
                (0, helpers_1.makeAnError)(new Error('Data temporarily unavailable; try again later'), callback);
                return;
            }
            if (!getActions) {
                callback?.(null, (0, helpers_1.processItems)(items));
            }
            else {
                this.manager._addDescriptions(items, (err, describedItems) => {
                    if (err) {
                        callback?.(null, (0, helpers_1.processItems)(items));
                    }
                    else {
                        callback?.(null, describedItems);
                    }
                });
            }
        }, 'tradeoffermanager');
    }
    getExchangeDetails(getDetailsIfFailedOrCallback, callback) {
        if (typeof getDetailsIfFailedOrCallback === 'function') {
            callback = getDetailsIfFailedOrCallback;
            getDetailsIfFailedOrCallback = false;
        }
        const getDetailsIfFailed = getDetailsIfFailedOrCallback;
        if (!this.id) {
            (0, helpers_1.makeAnError)(new Error('Cannot get trade details for an unsent trade offer'), callback);
            return;
        }
        if (!this.tradeID) {
            (0, helpers_1.makeAnError)(new Error('No trade ID; unable to get trade details'), callback);
            return;
        }
        this.manager._apiCall('GET', { iface: 'ISteamEconomy', method: 'GetTradeStatus' }, 1, { tradeid: this.tradeID }, (err, result) => {
            if (err) {
                (0, helpers_1.makeAnError)(err, callback);
                return;
            }
            const res = result;
            if (!res['response'] || !res['response']['trades']) {
                (0, helpers_1.makeAnError)(new Error('Malformed response'), callback);
                return;
            }
            const trades = res['response']['trades'];
            const trade = trades[0];
            if (!trade || trade['tradeid'] !== this.tradeID) {
                (0, helpers_1.makeAnError)(new Error('Trade not found in GetTradeStatus response; try again later'), callback);
                return;
            }
            const status = trade['status'];
            if (!getDetailsIfFailed &&
                ![ETradeStatus_1.ETradeStatus.Complete, ETradeStatus_1.ETradeStatus.InEscrow, ETradeStatus_1.ETradeStatus.EscrowRollback].includes(status)) {
                (0, helpers_1.makeAnError)(new Error('Trade status is ' + (ETradeStatus_1.ETradeStatus[status] ?? status)), callback);
                return;
            }
            if (!this.manager._language) {
                callback?.(null, status, new Date(trade['time_init'] * 1000), trade['assets_received'] ?? [], trade['assets_given'] ?? []);
            }
            else {
                const allAssets = [...(trade['assets_received'] ?? []), ...(trade['assets_given'] ?? [])];
                this.manager._requestDescriptions(allAssets, (descErr) => {
                    if (descErr) {
                        callback?.(descErr);
                        return;
                    }
                    const received = this.manager._mapItemsToDescriptions(null, null, trade['assets_received'] ?? []);
                    const given = this.manager._mapItemsToDescriptions(null, null, trade['assets_given'] ?? []);
                    callback?.(null, status, new Date(trade['time_init'] * 1000), received, given);
                });
            }
        });
    }
    getUserDetails(callback) {
        if (this.id && this.isOurOffer) {
            (0, helpers_1.makeAnError)(new Error('Cannot get user details for an offer that we sent.'), callback);
            return;
        }
        if (this.id && this.state !== ETradeOfferState_1.ETradeOfferState.Active) {
            (0, helpers_1.makeAnError)(new Error('Cannot get user details for an offer that is sent and not Active.'), callback);
            return;
        }
        let url;
        if (this.id) {
            url = `https://steamcommunity.com/tradeoffer/${this.id}/`;
        }
        else {
            url = `https://steamcommunity.com/tradeoffer/new/?partner=${this.partner.accountid}`;
            if (this._token)
                url += '&token=' + this._token;
        }
        this.manager._community.httpRequestGet(url, (err, response, body) => {
            if (err || response.statusCode !== 200) {
                (0, helpers_1.makeAnError)(err ?? new Error('HTTP error ' + response.statusCode), callback);
                return;
            }
            const bStr = body;
            const scriptMatch = bStr.match(/\n\W*<script type="text\/javascript">\W*\r?\n?(\W*var g_rgAppContextData[\s\S]*)<\/script>/);
            if (!scriptMatch) {
                (0, helpers_1.makeAnError)(new Error('Malformed response'), callback);
                return;
            }
            let script = scriptMatch[1];
            const closePos = script.indexOf('</script>');
            if (closePos !== -1)
                script = script.substring(0, closePos);
            const vmContext = vm.createContext({
                UserYou: { SetProfileURL: () => undefined, SetSteamId: () => undefined },
                UserThem: { SetProfileURL: () => undefined, SetSteamId: () => undefined },
                $J: () => undefined,
            });
            vm.runInContext(script, vmContext);
            const ctx = vmContext;
            const me = {
                personaName: ctx['g_strYourPersonaName'],
                contexts: ctx['g_rgAppContextData'],
            };
            const them = {
                personaName: ctx['g_strTradePartnerPersonaName'],
                contexts: ctx['g_rgPartnerAppContextData'],
                probation: ctx['g_bTradePartnerProbation'],
            };
            const myEscrow = bStr.match(/var g_daysMyEscrow = (\d+);/);
            const theirEscrow = bStr.match(/var g_daysTheirEscrow = (\d+);/);
            if (myEscrow && theirEscrow) {
                me.escrowDays = parseInt(myEscrow[1], 10);
                them.escrowDays = parseInt(theirEscrow[1], 10);
            }
            const myAvatar = bStr.match(new RegExp('<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' + this.manager.steamID.accountid + '">'));
            const theirAvatar = bStr.match(new RegExp('<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' + this.partner.accountid + '">'));
            if (myAvatar) {
                me.avatarIcon = myAvatar[1];
                me.avatarMedium = myAvatar[1].replace('.jpg', '_medium.jpg');
                me.avatarFull = myAvatar[1].replace('.jpg', '_full.jpg');
            }
            if (theirAvatar) {
                them.avatarIcon = theirAvatar[1];
                them.avatarMedium = theirAvatar[1].replace('.jpg', '_medium.jpg');
                them.avatarFull = theirAvatar[1].replace('.jpg', '_full.jpg');
            }
            callback(null, me, them);
        });
    }
    counter() {
        if (this.state !== ETradeOfferState_1.ETradeOfferState.Active) {
            throw new Error('Cannot counter a non-active offer.');
        }
        const offer = this.duplicate();
        offer._countering = this.id;
        return offer;
    }
    duplicate() {
        const offer = new TradeOffer(this.manager, this.partner, this._token);
        offer.itemsToGive = this.itemsToGive.slice();
        offer.itemsToReceive = this.itemsToReceive.slice();
        offer.isOurOffer = true;
        offer.fromRealTimeTrade = false;
        return offer;
    }
    setMessage(message) {
        if (this.id)
            throw new Error('Cannot set message in an already-sent offer');
        this.message = message.toString().substring(0, 128);
    }
    setToken(token) {
        if (this.id)
            throw new Error('Cannot set token in an already-sent offer');
        this._token = token;
    }
}
exports.TradeOffer = TradeOffer;
// ── Module-level helper (not on prototype) ───────────────────────────────────
function addItem(details, offer, list) {
    if (offer.id)
        throw new Error('Cannot add items to an already-sent offer');
    if (details.appid === undefined ||
        details.contextid === undefined ||
        (details.assetid === undefined && details.id === undefined)) {
        throw new Error('Missing appid, contextid, or assetid parameter');
    }
    const item = {
        id: (details.id ?? details.assetid).toString(),
        assetid: (details.assetid ?? details.id).toString(),
        appid: parseInt(details.appid, 10),
        contextid: details.contextid.toString(),
        amount: parseInt((details.amount ?? 1), 10),
    };
    if (item.assetid === '0' || item.contextid === '0') {
        throw new Error('Invalid assetid or contextid');
    }
    if (list.some((tradeItem) => (0, helpers_1.itemEquals)(tradeItem, item))) {
        return false;
    }
    list.push(item);
    return true;
}
//# sourceMappingURL=TradeOffer.js.map