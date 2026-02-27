import { EconItem } from '../classes/EconItem';
declare module '../TradeOfferManager' {
    interface TradeOfferManager {
        _digestDescriptions(descriptions: Record<string, unknown>[] | Record<string, Record<string, unknown>> | null | undefined): void;
        _mapItemsToDescriptions(appid: number | null, contextid: string | null, items: Record<string, unknown>[]): EconItem[];
        _hasDescription(item: Record<string, unknown>, appid?: number): boolean;
        _addDescriptions(items: Record<string, unknown>[], callback: (err: Error | null, items?: EconItem[]) => void): void;
        _requestDescriptions(classes: Array<{
            appid: number;
            classid: string;
            instanceid?: string;
        }>, callback: (err?: Error | null) => void): void;
    }
}
//# sourceMappingURL=assets.d.ts.map