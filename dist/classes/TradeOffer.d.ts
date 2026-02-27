import SteamID from 'steamid';
import { ETradeOfferState } from '../resources/ETradeOfferState';
import { EConfirmationMethod } from '../resources/EConfirmationMethod';
import type { TradeOfferManager } from '../TradeOfferManager';
import { EconItem } from './EconItem';
import type { TradeUserDetails } from '../types';
export interface TradeItemInput {
    appid: number | string;
    contextid: string | number;
    assetid?: string | number;
    id?: string | number;
    amount?: number | string;
}
export declare class TradeOffer {
    partner: SteamID;
    id: string | null;
    message: string | null;
    state: ETradeOfferState;
    itemsToGive: EconItem[];
    itemsToReceive: EconItem[];
    isOurOffer: boolean | null;
    created: Date | null;
    updated: Date | null;
    expires: Date | null;
    tradeID: string | null;
    fromRealTimeTrade: boolean | null;
    confirmationMethod: EConfirmationMethod | null;
    escrowEnds: Date | null;
    rawJson: string;
    /** @internal */ readonly manager: TradeOfferManager;
    /** @internal */ _countering: string | null;
    /** @internal */ _tempData: Record<string, unknown>;
    /** @internal */ _token: string | undefined;
    constructor(manager: TradeOfferManager, partner: string | SteamID, token?: string);
    isGlitched(): boolean;
    containsItem(item: TradeItemInput): boolean;
    /** Get / set arbitrary per-offer data that is persisted in pollData. */
    data(): Record<string, unknown>;
    data(key: string): unknown;
    data(key: string, value: unknown): void;
    getPartnerInventoryContents(appid: number, contextid: number, callback: (err: Error | null, items?: EconItem[], currency?: EconItem[], totalCount?: number) => void): void;
    addMyItem(item: TradeItemInput): boolean;
    addMyItems(items: TradeItemInput[]): number;
    removeMyItem(item: TradeItemInput): boolean;
    removeMyItems(items: TradeItemInput[]): number;
    addTheirItem(item: TradeItemInput): boolean;
    addTheirItems(items: TradeItemInput[]): number;
    removeTheirItem(item: TradeItemInput): boolean;
    removeTheirItems(items: TradeItemInput[]): number;
    send(callback?: (err: Error | null, status?: 'sent' | 'pending') => void): void;
    cancel(callback?: (err: Error | null) => void): void;
    decline(callback?: (err: Error | null) => void): void;
    accept(skipStateUpdate?: boolean | ((err: Error | null, status?: 'accepted' | 'pending' | 'escrow') => void), callback?: (err: Error | null, status?: 'accepted' | 'pending' | 'escrow') => void): void;
    update(callback: (err: Error | null) => void): void;
    getReceivedItems(getActionsOrCallback: boolean | ((err: Error | null, items?: EconItem[]) => void), callback?: (err: Error | null, items?: EconItem[]) => void): void;
    getExchangeDetails(getDetailsIfFailedOrCallback: boolean | ((err: Error | null, status?: number, tradeInitTime?: Date, receivedItems?: unknown[], sentItems?: unknown[]) => void), callback?: (err: Error | null, status?: number, tradeInitTime?: Date, receivedItems?: unknown[], sentItems?: unknown[]) => void): void;
    getUserDetails(callback: (err: Error | null, me?: TradeUserDetails, them?: TradeUserDetails) => void): void;
    counter(): TradeOffer;
    duplicate(): TradeOffer;
    setMessage(message: string): void;
    setToken(token: string): void;
}
//# sourceMappingURL=TradeOffer.d.ts.map