import type { RawTradeOffer, RawTradeItem } from './types';
import type { TradeOfferManager } from './TradeOfferManager';
import { EconItem } from './classes/EconItem';
import { TradeOffer } from './classes/TradeOffer';
export declare function itemEquals(a: RawTradeItem, b: RawTradeItem): boolean;
export declare function makeAnError(error: Error | null, callback?: ((err: Error | null) => void) | null, body?: Record<string, unknown> | null): Error | null;
export declare function offerSuperMalformed(offer: Partial<RawTradeOffer>): boolean;
export declare function offerMalformed(offer: Partial<RawTradeOffer>): boolean;
export declare function itemMalformed(item: RawTradeItem): boolean;
export declare function processItems(items: Record<string, unknown>[]): EconItem[];
export declare function sanitizeRawOffer(offer: RawTradeOffer): RawTradeOffer;
export declare function checkNeededDescriptions(manager: TradeOfferManager, offers: RawTradeOffer[], callback: (err?: Error | null) => void): void;
export declare function createOfferFromData(manager: TradeOfferManager, data: RawTradeOffer): TradeOffer;
//# sourceMappingURL=helpers.d.ts.map