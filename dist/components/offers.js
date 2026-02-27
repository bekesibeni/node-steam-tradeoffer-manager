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
const steamid_1 = __importDefault(require("steamid"));
const TradeOfferManager_1 = require("../TradeOfferManager");
const EOfferFilter_1 = require("../resources/EOfferFilter");
const Helpers = __importStar(require("../helpers"));
const TradeOffer_1 = require("../classes/TradeOffer");
TradeOfferManager_1.TradeOfferManager.prototype.getOffer = function (id, callback) {
    this._apiCall('GET', 'GetTradeOffer', 1, { tradeofferid: id }, (err, body) => {
        if (err) {
            callback(err);
            return;
        }
        const response = (body['response'] ?? {});
        if (!body['response']) {
            callback(new Error('Malformed API response'));
            return;
        }
        if (!response['offer']) {
            callback(new Error('No matching offer found'));
            return;
        }
        const rawOffer = Helpers.sanitizeRawOffer(response['offer']);
        if (Helpers.offerMalformed(rawOffer)) {
            callback(new Error('Data temporarily unavailable'));
            return;
        }
        this._digestDescriptions(body['response']['descriptions']);
        Helpers.checkNeededDescriptions(this, [rawOffer], (err) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, Helpers.createOfferFromData(this, rawOffer));
        });
    });
};
TradeOfferManager_1.TradeOfferManager.prototype.getOffers = function (filter, historicalCutoffOrCallback, callback) {
    if (![EOfferFilter_1.EOfferFilter.ActiveOnly, EOfferFilter_1.EOfferFilter.HistoricalOnly, EOfferFilter_1.EOfferFilter.All].includes(filter)) {
        throw new Error(`Unexpected value "${filter}" for "filter" parameter. Expected a value from the EOfferFilter enum.`);
    }
    let historicalCutoff;
    if (typeof historicalCutoffOrCallback === 'function') {
        callback = historicalCutoffOrCallback;
        historicalCutoff = new Date(Date.now() + 31536000000);
    }
    else if (!historicalCutoffOrCallback) {
        historicalCutoff = new Date(Date.now() + 31536000000);
    }
    else {
        historicalCutoff = historicalCutoffOrCallback;
    }
    const options = {
        get_sent_offers: 1,
        get_received_offers: 1,
        get_descriptions: 0,
        language: this._language,
        active_only: filter === EOfferFilter_1.EOfferFilter.ActiveOnly ? 1 : 0,
        historical_only: filter === EOfferFilter_1.EOfferFilter.HistoricalOnly ? 1 : 0,
        time_historical_cutoff: Math.floor(historicalCutoff.getTime() / 1000),
        cursor: 0,
    };
    let sentOffers = [];
    let receivedOffers = [];
    const request = () => {
        this._apiCall('GET', 'GetTradeOffers', 1, options, (err, body) => {
            if (err) {
                callback(err);
                return;
            }
            const response = (body['response'] ?? {});
            if (!body['response']) {
                callback(new Error('Malformed API response'));
                return;
            }
            const allOffers = [
                ...(response['trade_offers_sent'] ?? []),
                ...(response['trade_offers_received'] ?? []),
            ];
            if (allOffers.length > 0 &&
                (allOffers.every(Helpers.offerMalformed) || allOffers.some(Helpers.offerSuperMalformed))) {
                callback(new Error('Data temporarily unavailable'));
                return;
            }
            sentOffers = sentOffers.concat(response['trade_offers_sent'] ?? []);
            receivedOffers = receivedOffers.concat(response['trade_offers_received'] ?? []);
            options['cursor'] = response['next_cursor'] ?? 0;
            if (typeof options['cursor'] === 'number' && options['cursor'] !== 0) {
                this.emit('debug', 'GetTradeOffers with cursor ' + options['cursor']);
                request();
            }
            else {
                finish();
            }
        });
    };
    const finish = () => {
        sentOffers = sentOffers.map(Helpers.sanitizeRawOffer);
        receivedOffers = receivedOffers.map(Helpers.sanitizeRawOffer);
        Helpers.checkNeededDescriptions(this, sentOffers.concat(receivedOffers), (err) => {
            if (err) {
                callback(new Error('Descriptions: ' + err.message));
                return;
            }
            const sent = sentOffers.map((data) => Helpers.createOfferFromData(this, data));
            const received = receivedOffers.map((data) => Helpers.createOfferFromData(this, data));
            callback(null, sent, received);
            this.emit('offerList', filter, sent, received);
        });
    };
    request();
};
TradeOfferManager_1.TradeOfferManager.prototype.createOffer = function (partner, token) {
    if (typeof partner === 'string' && partner.match(/^https?:\/\//)) {
        const url = new URL(partner);
        const partnerParam = url.searchParams.get('partner');
        if (!partnerParam)
            throw new Error('Invalid trade URL');
        partner = steamid_1.default.fromIndividualAccountID(partnerParam);
        token = url.searchParams.get('token') ?? undefined;
    }
    const offer = new TradeOffer_1.TradeOffer(this, partner, token);
    offer.isOurOffer = true;
    offer.fromRealTimeTrade = false;
    return offer;
};
//# sourceMappingURL=offers.js.map