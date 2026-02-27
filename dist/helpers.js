"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.itemEquals = itemEquals;
exports.makeAnError = makeAnError;
exports.offerSuperMalformed = offerSuperMalformed;
exports.offerMalformed = offerMalformed;
exports.itemMalformed = itemMalformed;
exports.processItems = processItems;
exports.sanitizeRawOffer = sanitizeRawOffer;
exports.checkNeededDescriptions = checkNeededDescriptions;
exports.createOfferFromData = createOfferFromData;
const steamid_1 = __importDefault(require("steamid"));
const EResult_1 = require("./resources/EResult");
const EConfirmationMethod_1 = require("./resources/EConfirmationMethod");
const EconItem_1 = require("./classes/EconItem");
const TradeOffer_1 = require("./classes/TradeOffer");
function itemEquals(a, b) {
    return (a.appid == b.appid &&
        a.contextid == b.contextid &&
        (a.assetid || a.id) == (b.assetid || b.id));
}
function makeAnError(error, callback, body) {
    if (!callback)
        return null;
    if (body?.strError) {
        const strError = body.strError;
        error = new Error(strError);
        const match = strError.match(/\((\d+)\)$/);
        if (match) {
            error.eresult = parseInt(match[1], 10);
        }
        if (strError.match(/You cannot trade with .* because they have a trade ban\./)) {
            error.cause = 'TradeBan';
        }
        if (strError.match(/You have logged in from a new device/)) {
            error.cause = 'NewDevice';
        }
        if (strError.match(/is not available to trade\. More information will be shown to/)) {
            error.cause = 'TargetCannotTrade';
        }
        if (strError.match(/sent too many trade offers/)) {
            error.cause = 'OfferLimitExceeded';
            error.eresult = EResult_1.EResult.LimitExceeded;
        }
        if (strError.match(/unable to contact the game's item server/)) {
            error.cause = 'ItemServerUnavailable';
            error.eresult = EResult_1.EResult.ServiceUnavailable;
        }
        callback(error);
        return error;
    }
    callback(error);
    return error;
}
function offerSuperMalformed(offer) {
    return !offer.accountid_other;
}
function offerMalformed(offer) {
    return (offerSuperMalformed(offer) ||
        ((offer.items_to_give || []).length === 0 && (offer.items_to_receive || []).length === 0) ||
        (offer.items_to_give || []).some(itemMalformed) ||
        (offer.items_to_receive || []).some(itemMalformed));
}
function itemMalformed(item) {
    return !item.appid || !item.contextid || !(item.assetid || item.id);
}
function processItems(items) {
    return items.map((item) => new EconItem_1.EconItem(item));
}
function sanitizeRawOffer(offer) {
    const sanitized = { ...offer };
    if ((sanitized.items_to_give || []).length > 0) {
        sanitized.items_to_give = sanitized.items_to_give.filter((item) => !itemMalformed(item));
    }
    if ((sanitized.items_to_receive || []).length > 0) {
        sanitized.items_to_receive = sanitized.items_to_receive.filter((item) => !itemMalformed(item));
    }
    return sanitized;
}
function checkNeededDescriptions(manager, offers, callback) {
    if (!manager._language) {
        callback(null);
        return;
    }
    const items = [];
    for (const offer of offers) {
        for (const item of [
            ...(offer.items_to_give || []),
            ...(offer.items_to_receive || []),
        ]) {
            if (!manager._hasDescription(item)) {
                items.push(item);
            }
        }
    }
    if (!items.length) {
        callback(null);
        return;
    }
    manager._requestDescriptions(items, callback);
}
function createOfferFromData(manager, data) {
    const offer = new TradeOffer_1.TradeOffer(manager, new steamid_1.default('[U:1:' + data.accountid_other + ']'));
    offer.id = data.tradeofferid.toString();
    offer.message = data.message;
    offer.state = data.trade_offer_state;
    // Assign raw items first; they'll be replaced with EconItem instances below
    offer.itemsToGive = (data.items_to_give || []);
    offer.itemsToReceive = (data.items_to_receive || []);
    offer.isOurOffer = data.is_our_offer;
    offer.created = new Date(data.time_created * 1000);
    offer.updated = new Date(data.time_updated * 1000);
    offer.expires = new Date(data.expiration_time * 1000);
    offer.tradeID = data.tradeid ? data.tradeid.toString() : null;
    offer.fromRealTimeTrade = data.from_real_time_trade;
    offer.confirmationMethod = (data.confirmation_method ?? EConfirmationMethod_1.EConfirmationMethod.None);
    offer.escrowEnds = data.escrow_end_date ? new Date(data.escrow_end_date * 1000) : null;
    offer.rawJson = JSON.stringify(data, null, '\t');
    if (manager._language) {
        offer.itemsToGive = manager._mapItemsToDescriptions(null, null, offer.itemsToGive);
        offer.itemsToReceive = manager._mapItemsToDescriptions(null, null, offer.itemsToReceive);
    }
    else {
        offer.itemsToGive = processItems(offer.itemsToGive);
        offer.itemsToReceive = processItems(offer.itemsToReceive);
    }
    return offer;
}
//# sourceMappingURL=helpers.js.map