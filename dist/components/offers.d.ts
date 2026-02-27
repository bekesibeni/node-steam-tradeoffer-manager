import SteamID from 'steamid';
import { EOfferFilter } from '../resources/EOfferFilter';
import { TradeOffer } from '../classes/TradeOffer';
declare module '../TradeOfferManager' {
    interface TradeOfferManager {
        getOffer(id: string | number, callback: (err: Error | null, offer?: TradeOffer) => void): void;
        getOffers(filter: EOfferFilter, historicalCutoff: Date | ((err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void), callback?: (err: Error | null, sent?: TradeOffer[], received?: TradeOffer[]) => void): void;
        createOffer(partner: string | SteamID, token?: string): TradeOffer;
    }
}
//# sourceMappingURL=offers.d.ts.map