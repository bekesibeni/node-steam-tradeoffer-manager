"use strict";

import SteamID from 'steamid';

import { EResult } from './resources/EResult';
import { EConfirmationMethod } from './resources/EConfirmationMethod';
import type { RawTradeOffer, RawTradeItem } from './types';
import type { TradeOfferManager } from './TradeOfferManager';
import { EconItem } from './classes/EconItem';
import { TradeOffer } from './classes/TradeOffer';

export function itemEquals(a: RawTradeItem, b: RawTradeItem): boolean {
	return (
		a.appid == b.appid &&
		a.contextid == b.contextid &&
		(a.assetid || a.id) == (b.assetid || b.id)
	);
}

export function makeAnError(
	error: Error | null,
	callback?: ((err: Error | null) => void) | null,
	body?: Record<string, unknown> | null,
): Error | null {
	if (!callback) return null;

	if (body?.strError) {
		const strError = body.strError as string;
		error = new Error(strError);

		const match = strError.match(/\((\d+)\)$/);
		if (match) {
			(error as NodeJS.ErrnoException & { eresult?: number }).eresult = parseInt(match[1]!, 10);
		}

		if (strError.match(/You cannot trade with .* because they have a trade ban\./)) {
			(error as Error & { cause?: string }).cause = 'TradeBan';
		}
		if (strError.match(/You have logged in from a new device/)) {
			(error as Error & { cause?: string }).cause = 'NewDevice';
		}
		if (strError.match(/is not available to trade\. More information will be shown to/)) {
			(error as Error & { cause?: string }).cause = 'TargetCannotTrade';
		}
		if (strError.match(/sent too many trade offers/)) {
			(error as Error & { cause?: string; eresult?: number }).cause = 'OfferLimitExceeded';
			(error as Error & { eresult?: number }).eresult = EResult.LimitExceeded;
		}
		if (strError.match(/unable to contact the game's item server/)) {
			(error as Error & { cause?: string; eresult?: number }).cause = 'ItemServerUnavailable';
			(error as Error & { eresult?: number }).eresult = EResult.ServiceUnavailable;
		}

		callback(error);
		return error;
	}

	callback(error);
	return error;
}

export function offerSuperMalformed(offer: Partial<RawTradeOffer>): boolean {
	return !offer.accountid_other;
}

export function offerMalformed(offer: Partial<RawTradeOffer>): boolean {
	return (
		offerSuperMalformed(offer) ||
		((offer.items_to_give || []).length === 0 && (offer.items_to_receive || []).length === 0) ||
		(offer.items_to_give || []).some(itemMalformed) ||
		(offer.items_to_receive || []).some(itemMalformed)
	);
}

export function itemMalformed(item: RawTradeItem): boolean {
	return !item.appid || !item.contextid || !(item.assetid || item.id);
}

export function processItems(items: Record<string, unknown>[]): EconItem[] {
	return items.map((item) => new EconItem(item));
}

export function sanitizeRawOffer(offer: RawTradeOffer): RawTradeOffer {
	const sanitized = { ...offer };
	if ((sanitized.items_to_give || []).length > 0) {
		sanitized.items_to_give = sanitized.items_to_give!.filter((item) => !itemMalformed(item));
	}
	if ((sanitized.items_to_receive || []).length > 0) {
		sanitized.items_to_receive = sanitized.items_to_receive!.filter((item) => !itemMalformed(item));
	}
	return sanitized;
}

export function checkNeededDescriptions(
	manager: TradeOfferManager,
	offers: RawTradeOffer[],
	callback: (err?: Error | null) => void,
): void {
	if (!manager._language) {
		callback(null);
		return;
	}

	const items: RawTradeItem[] = [];
	for (const offer of offers) {
		for (const item of [
			...(offer.items_to_give || []),
			...(offer.items_to_receive || []),
		]) {
			if (!manager._hasDescription(item as unknown as Record<string, unknown>)) {
				items.push(item);
			}
		}
	}

	if (!items.length) {
		callback(null);
		return;
	}

	manager._requestDescriptions(
		items as unknown as Array<{ appid: number; classid: string; instanceid?: string }>,
		callback,
	);
}

export function createOfferFromData(manager: TradeOfferManager, data: RawTradeOffer): TradeOffer {
	const offer = new TradeOffer(manager, new SteamID('[U:1:' + data.accountid_other + ']'));
	offer.id = data.tradeofferid.toString();
	offer.message = data.message;
	offer.state = data.trade_offer_state;
	// Assign raw items first; they'll be replaced with EconItem instances below
	offer.itemsToGive = (data.items_to_give || []) as unknown as EconItem[];
	offer.itemsToReceive = (data.items_to_receive || []) as unknown as EconItem[];
	offer.isOurOffer = data.is_our_offer;
	offer.created = new Date(data.time_created * 1000);
	offer.updated = new Date(data.time_updated * 1000);
	offer.expires = new Date(data.expiration_time * 1000);
	offer.tradeID = data.tradeid ? data.tradeid.toString() : null;
	offer.fromRealTimeTrade = data.from_real_time_trade;
	offer.confirmationMethod = (data.confirmation_method ?? EConfirmationMethod.None) as EConfirmationMethod;
	offer.escrowEnds = data.escrow_end_date ? new Date(data.escrow_end_date * 1000) : null;
	offer.rawJson = JSON.stringify(data, null, '\t');

	if (manager._language) {
		offer.itemsToGive = manager._mapItemsToDescriptions(
			null,
			null,
			offer.itemsToGive as unknown as Record<string, unknown>[],
		);
		offer.itemsToReceive = manager._mapItemsToDescriptions(
			null,
			null,
			offer.itemsToReceive as unknown as Record<string, unknown>[],
		);
	} else {
		offer.itemsToGive = processItems(offer.itemsToGive as unknown as Record<string, unknown>[]);
		offer.itemsToReceive = processItems(offer.itemsToReceive as unknown as Record<string, unknown>[]);
	}

	return offer;
}
