declare module '../TradeOfferManager' {
    interface TradeOfferManager {
        doPoll(doFullUpdate?: boolean): void;
        _resetPollTimer(time?: number): void;
    }
}
export {};
//# sourceMappingURL=polling.d.ts.map