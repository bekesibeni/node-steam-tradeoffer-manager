"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const objects_1 = require("@doctormckay/stdlib/objects");
const TradeOfferManager_1 = require("../TradeOfferManager");
const ETradeOfferState_1 = require("../resources/ETradeOfferState");
const EOfferFilter_1 = require("../resources/EOfferFilter");
const EConfirmationMethod_1 = require("../resources/EConfirmationMethod");
TradeOfferManager_1.TradeOfferManager.prototype.doPoll = function (doFullUpdate) {
    if (!this.apiKey && !this.accessToken)
        return;
    const timeSinceLastPoll = Date.now() - this._lastPoll;
    if (timeSinceLastPoll < this.minimumPollInterval) {
        this._resetPollTimer(this.minimumPollInterval - timeSinceLastPoll);
        return;
    }
    this._lastPoll = Date.now();
    clearTimeout(this._pollTimer ?? undefined);
    let offersSince = 0;
    if (this.pollData.offersSince) {
        offersSince = this.pollData.offersSince - 1800; // 30-minute buffer
    }
    let fullUpdate = false;
    if (Date.now() - this._lastPollFullUpdate >= this.pollFullUpdateInterval || doFullUpdate) {
        fullUpdate = true;
        this._lastPollFullUpdate = Date.now();
        offersSince = 1;
    }
    this.emit('debug', `Doing trade offer poll since ${offersSince}${fullUpdate ? ' (full update)' : ''}`);
    const requestStart = Date.now();
    this.getOffers(fullUpdate ? EOfferFilter_1.EOfferFilter.All : EOfferFilter_1.EOfferFilter.ActiveOnly, new Date(offersSince * 1000), (err, sent, received) => {
        if (err) {
            this.emit('debug', 'Error getting trade offers for poll: ' + err.message);
            this.emit('pollFailure', err);
            this._resetPollTimer();
            return;
        }
        this.emit('debug', `Trade offer poll succeeded in ${Date.now() - requestStart} ms`);
        const origPollData = JSON.parse(JSON.stringify(this.pollData));
        let sentOffers = this.pollData.sent ?? {};
        const timestamps = this.pollData.timestamps ?? {};
        let hasGlitchedOffer = false;
        // ── Process sent offers ─────────────────────────────────────────
        for (const offer of (sent ?? [])) {
            if (!sentOffers[offer.id]) {
                if (!this._pendingOfferSendResponses) {
                    if (offer.fromRealTimeTrade) {
                        if (offer.state === ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation ||
                            (offer.state === ETradeOfferState_1.ETradeOfferState.Active && offer.confirmationMethod !== EConfirmationMethod_1.EConfirmationMethod.None)) {
                            this.emit('realTimeTradeConfirmationRequired', offer);
                        }
                        else if (offer.state === ETradeOfferState_1.ETradeOfferState.Accepted) {
                            this.emit('realTimeTradeCompleted', offer);
                        }
                    }
                    this.emit('unknownOfferSent', offer);
                    sentOffers[offer.id] = offer.state;
                    timestamps[offer.id] = offer.created.getTime() / 1000;
                }
            }
            else if (offer.state !== sentOffers[offer.id]) {
                if (!offer.isGlitched()) {
                    if (offer.fromRealTimeTrade && offer.state === ETradeOfferState_1.ETradeOfferState.Accepted) {
                        this.emit('realTimeTradeCompleted', offer);
                    }
                    this.emit('sentOfferChanged', offer, sentOffers[offer.id]);
                    sentOffers[offer.id] = offer.state;
                    timestamps[offer.id] = offer.created.getTime() / 1000;
                }
                else {
                    hasGlitchedOffer = true;
                    const noName = !this._language
                        ? 0
                        : offer.itemsToGive.concat(offer.itemsToReceive).filter((item) => !item.name).length;
                    this.emit('debug', `Not emitting sentOfferChanged for ${offer.id} right now because it's glitched ` +
                        `(${offer.itemsToGive.length} to give, ${offer.itemsToReceive.length} to receive, ${noName} without name)`);
                }
            }
            if (offer.state === ETradeOfferState_1.ETradeOfferState.Active) {
                let cancelTime = this.cancelTime;
                const customCancelTime = offer.data('cancelTime');
                if (customCancelTime !== undefined)
                    cancelTime = customCancelTime;
                if (cancelTime && Date.now() - offer.updated.getTime() >= cancelTime) {
                    offer.cancel((err) => {
                        if (!err)
                            this.emit('sentOfferCanceled', offer, 'cancelTime');
                        else
                            this.emit('debug', `Can't auto-cancel offer #${offer.id}: ${err.message}`);
                    });
                }
            }
            if (offer.state === ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation && this.pendingCancelTime) {
                let pendingCancelTime = this.pendingCancelTime;
                const customPCT = offer.data('pendingCancelTime');
                if (customPCT !== undefined)
                    pendingCancelTime = customPCT;
                if (pendingCancelTime && Date.now() - offer.created.getTime() >= pendingCancelTime) {
                    offer.cancel((err) => {
                        if (!err)
                            this.emit('sentPendingOfferCanceled', offer);
                        else
                            this.emit('debug', `Can't auto-cancel pending offer #${offer.id}: ${err.message}`);
                    });
                }
            }
        }
        // ── cancelOfferCount ──────────────────────────────────────────
        if (this.cancelOfferCount) {
            const sentActive = (sent ?? []).filter((o) => o.state === ETradeOfferState_1.ETradeOfferState.Active);
            if (sentActive.length >= this.cancelOfferCount) {
                let oldest = sentActive[0];
                for (let i = 1; i < sentActive.length; i++) {
                    if (sentActive[i].updated.getTime() < oldest.updated.getTime()) {
                        oldest = sentActive[i];
                    }
                }
                if (Date.now() - oldest.updated.getTime() >= this.cancelOfferCountMinAge) {
                    oldest.cancel((err) => {
                        if (!err)
                            this.emit('sentOfferCanceled', oldest, 'cancelOfferCount');
                    });
                }
            }
        }
        this.pollData.sent = sentOffers;
        let receivedOffers = this.pollData.received ?? {};
        // ── Process received offers ─────────────────────────────────────
        for (const offer of (received ?? [])) {
            if (offer.isGlitched()) {
                hasGlitchedOffer = true;
                continue;
            }
            if (offer.fromRealTimeTrade) {
                if (!receivedOffers[offer.id] &&
                    (offer.state === ETradeOfferState_1.ETradeOfferState.CreatedNeedsConfirmation ||
                        (offer.state === ETradeOfferState_1.ETradeOfferState.Active && offer.confirmationMethod !== EConfirmationMethod_1.EConfirmationMethod.None))) {
                    this.emit('realTimeTradeConfirmationRequired', offer);
                }
                else if (offer.state === ETradeOfferState_1.ETradeOfferState.Accepted &&
                    (!receivedOffers[offer.id] || receivedOffers[offer.id] !== offer.state)) {
                    this.emit('realTimeTradeCompleted', offer);
                }
            }
            if (!receivedOffers[offer.id] && offer.state === ETradeOfferState_1.ETradeOfferState.Active) {
                this.emit('newOffer', offer);
            }
            else if (receivedOffers[offer.id] && offer.state !== receivedOffers[offer.id]) {
                this.emit('receivedOfferChanged', offer, receivedOffers[offer.id]);
            }
            receivedOffers[offer.id] = offer.state;
            timestamps[offer.id] = offer.created.getTime() / 1000;
        }
        this.pollData.received = receivedOffers;
        this.pollData.timestamps = timestamps;
        // ── Update offersSince ──────────────────────────────────────────
        if (!hasGlitchedOffer) {
            let latest = this.pollData.offersSince ?? 0;
            for (const offer of [...(sent ?? []), ...(received ?? [])]) {
                const updated = Math.floor(offer.updated.getTime() / 1000);
                if (updated > latest)
                    latest = updated;
            }
            this.pollData.offersSince = latest;
        }
        this.emit('pollSuccess');
        if (!(0, objects_1.deepEqual)(origPollData, this.pollData)) {
            this.emit('pollData', this.pollData);
        }
        this._resetPollTimer();
    });
};
TradeOfferManager_1.TradeOfferManager.prototype._resetPollTimer = function (time) {
    if (this.pollInterval < 0)
        return;
    if (time !== undefined || this.pollInterval >= this.minimumPollInterval) {
        clearTimeout(this._pollTimer ?? undefined);
        this._pollTimer = setTimeout(this.doPoll.bind(this), time ?? this.pollInterval);
    }
};
//# sourceMappingURL=polling.js.map