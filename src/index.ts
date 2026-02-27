"use strict";

// Import components — each file augments TradeOfferManager.prototype via module augmentation
import './components/webapi';
import './components/assets';
import './components/polling';
import './components/offers';

export { TradeOfferManager } from './TradeOfferManager';
export { TradeOffer } from './classes/TradeOffer';
export { EconItem } from './classes/EconItem';

// Resources
export { ETradeOfferState } from './resources/ETradeOfferState';
export { EOfferFilter }     from './resources/EOfferFilter';
export { EResult }          from './resources/EResult';
export { EConfirmationMethod } from './resources/EConfirmationMethod';
export { ETradeStatus }     from './resources/ETradeStatus';

// Types
export type {
	TradeOfferManagerOptions,
	PollData,
	RawTradeOffer,
	RawTradeItem,
	TradeUserDetails,
	EconItemTag,
	EconItemDescription,
	AssetProperties,
	AssetAccessory,
	SimpleCallback,
	Callback,
} from './types';
