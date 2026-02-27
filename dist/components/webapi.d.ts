import type { ApiCallMethod } from '../types';
declare module '../TradeOfferManager' {
    interface TradeOfferManager {
        _apiCall(httpMethod: 'GET' | 'POST', method: string | ApiCallMethod, version: number, input: Record<string, unknown>, callback: (err: Error | null, body: Record<string, unknown>) => void): void;
    }
}
//# sourceMappingURL=webapi.d.ts.map