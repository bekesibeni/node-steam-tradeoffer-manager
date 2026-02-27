"use strict";

import SteamID from 'steamid';

import { TradeOfferManager } from '../TradeOfferManager';
import { EOfferFilter } from '../resources/EOfferFilter';
import * as Helpers from '../helpers';
import { TradeOffer } from '../classes/TradeOffer';
import type { RawTradeOffer } from '../types';

declare module '../TradeOfferManager' {
	interface TradeOfferManager {
		getOffer(
			id: string | number,
			callback: (err: Error | null, offer?: TradeOffer) => void,
		): void;
		getOffers(
			filter: EOfferFilter,
			historicalCutoff: Date | ((err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void),
			callback?: (err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void,
		): void;
		createOffer(partner: string | SteamID, token?: string): TradeOffer;
	}
}

TradeOfferManager.prototype.getOffer = function (
	this: TradeOfferManager,
	id: string | number,
	callback: (err: Error | null, offer?: TradeOffer) => void,
): void {
	this._apiCall('GET', 'GetTradeOffer', 1, { tradeofferid: id }, (err, body) => {
		if (err) { callback(err); return; }

		const response = (body['response'] ?? {}) as Record<string, unknown>;
		if (!body['response']) { callback(new Error('Malformed API response')); return; }
		if (!response['offer'])  { callback(new Error('No matching offer found')); return; }

		const rawOffer = Helpers.sanitizeRawOffer(response['offer'] as RawTradeOffer);

		if (Helpers.offerMalformed(rawOffer)) {
			callback(new Error('Data temporarily unavailable'));
			return;
		}

		this._digestDescriptions(
			(body['response'] as Record<string, unknown>)['descriptions'] as Record<string, unknown>[] | undefined,
		);
		Helpers.checkNeededDescriptions(this, [rawOffer], (err) => {
			if (err) { callback(err); return; }
			callback(null, Helpers.createOfferFromData(this, rawOffer));
		});
	});
};

TradeOfferManager.prototype.getOffers = function (
	this: TradeOfferManager,
	filter: EOfferFilter,
	historicalCutoffOrCallback: Date | ((err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void),
	callback?: (err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void,
): void {
	if (![EOfferFilter.ActiveOnly, EOfferFilter.HistoricalOnly, EOfferFilter.All].includes(filter)) {
		throw new Error(
			`Unexpected value "${filter}" for "filter" parameter. Expected a value from the EOfferFilter enum.`,
		);
	}

	let historicalCutoff: Date;
	if (typeof historicalCutoffOrCallback === 'function') {
		callback = historicalCutoffOrCallback;
		historicalCutoff = new Date(Date.now() + 31536000000);
	} else if (!historicalCutoffOrCallback) {
		historicalCutoff = new Date(Date.now() + 31536000000);
	} else {
		historicalCutoff = historicalCutoffOrCallback;
	}

	const options: Record<string, unknown> = {
		get_sent_offers:       1,
		get_received_offers:   1,
		get_descriptions:      0,
		language:              this._language,
		active_only:           filter === EOfferFilter.ActiveOnly   ? 1 : 0,
		historical_only:       filter === EOfferFilter.HistoricalOnly ? 1 : 0,
		time_historical_cutoff: Math.floor(historicalCutoff.getTime() / 1000),
		cursor:                0,
	};

	let sentOffers:     RawTradeOffer[] = [];
	let receivedOffers: RawTradeOffer[] = [];

	const request = (): void => {
		this._apiCall('GET', 'GetTradeOffers', 1, options, (err, body) => {
			if (err) { callback!(err); return; }

			const response = (body['response'] ?? {}) as Record<string, unknown>;
			if (!body['response']) { callback!(new Error('Malformed API response')); return; }

			const allOffers = [
				...((response['trade_offers_sent']     as RawTradeOffer[] | undefined) ?? []),
				...((response['trade_offers_received'] as RawTradeOffer[] | undefined) ?? []),
			];
			if (
				allOffers.length > 0 &&
				(allOffers.every(Helpers.offerMalformed) || allOffers.some(Helpers.offerSuperMalformed))
			) {
				callback!(new Error('Data temporarily unavailable'));
				return;
			}

			sentOffers     = sentOffers.concat((response['trade_offers_sent']     as RawTradeOffer[] | undefined) ?? []);
			receivedOffers = receivedOffers.concat((response['trade_offers_received'] as RawTradeOffer[] | undefined) ?? []);

			options['cursor'] = (response['next_cursor'] as number | undefined) ?? 0;
			if (typeof options['cursor'] === 'number' && options['cursor'] !== 0) {
				this.emit('debug', 'GetTradeOffers with cursor ' + options['cursor']);
				request();
			} else {
				finish();
			}
		});
	};

	const finish = (): void => {
		sentOffers     = sentOffers.map(Helpers.sanitizeRawOffer);
		receivedOffers = receivedOffers.map(Helpers.sanitizeRawOffer);

		Helpers.checkNeededDescriptions(this, sentOffers.concat(receivedOffers), (err) => {
			if (err) { callback!(new Error('Descriptions: ' + err!.message)); return; }

			const sent     = sentOffers.map((data)     => Helpers.createOfferFromData(this, data));
			const received = receivedOffers.map((data) => Helpers.createOfferFromData(this, data));

			callback!(null, sent, received);
			this.emit('offerList', filter, sent, received);
		});
	};

	request();
};

TradeOfferManager.prototype.createOffer = function (
	this: TradeOfferManager,
	partner: string | SteamID,
	token?: string,
): TradeOffer {
	if (typeof partner === 'string' && partner.match(/^https?:\/\//)) {
		const url          = new URL(partner);
		const partnerParam = url.searchParams.get('partner');
		if (!partnerParam) throw new Error('Invalid trade URL');

		partner = SteamID.fromIndividualAccountID(partnerParam);
		token   = url.searchParams.get('token') ?? undefined;
	}

	const offer = new TradeOffer(this, partner as SteamID, token);
	offer.isOurOffer      = true;
	offer.fromRealTimeTrade = false;
	return offer;
};
