import type SteamID from 'steamid';
import type { ETradeOfferState } from './resources/ETradeOfferState';

// ─── Callbacks ────────────────────────────────────────────────────────────────

export type SimpleCallback = (err: Error | null) => void;
export type Callback<T> = (err: Error | null, result: T) => void;

// ─── Trade error (augmented with Steam error info) ────────────────────────────

export class TradeError extends Error {
	eresult?: number;
	override cause?: string;
	body?: unknown;

	constructor(message: string) {
		super(message);
		this.name = 'TradeError';
	}
}

// ─── Constructor options ──────────────────────────────────────────────────────

export interface TradeOfferManagerOptions {
	/** A steam-user instance. If provided, the manager will trigger polls on new trade offers. */
	steam?: import('events').EventEmitter;
	/** An existing SteamCommunity instance to use. */
	community?: import('steamcommunity').SteamCommunity;
	/** Your domain to register your API key with. Default: 'localhost'. */
	domain?: string;
	/** The language for item descriptions (e.g. 'en', 'de'). Omit for no descriptions. */
	language?: string;
	/** How often to poll for new offers, in ms. Default: 30000. Set negative to disable timer-based polling. */
	pollInterval?: number;
	/** Minimum time between polls, in ms. Default: 1000. */
	minimumPollInterval?: number;
	/** How often to do a full update (fetch all offers), in ms. Default: 120000. */
	pollFullUpdateInterval?: number;
	/** Auto-cancel sent offers after this many ms if not accepted. */
	cancelTime?: number;
	/** Auto-cancel sent offers awaiting confirmation after this many ms. */
	pendingCancelTime?: number;
	/** Auto-cancel the oldest active offer when you have this many sent active offers. */
	cancelOfferCount?: number;
	/** Minimum age (in ms) for an offer to be eligible for cancelOfferCount auto-cancellation. Default: 0. */
	cancelOfferCountMinAge?: number;
	/** Share the asset description cache across all TradeOfferManager instances. Default: false. */
	globalAssetCache?: boolean;
	/** Max number of items to keep in the asset description cache. Default: 500. */
	assetCacheMaxItems?: number;
	/** How often to garbage-collect the asset cache, in ms. Default: 120000. */
	assetCacheGcInterval?: number;
	/** Previously saved poll data to restore state. */
	pollData?: PollData;
	/** Directory for persistent data (poll data, asset descriptions). Pass null to disable. */
	dataDirectory?: string | null;
	/** Gzip persistent data files. Default: false. */
	gzipData?: boolean;
	/** Automatically save and restore poll data from disk. Default: false. */
	savePollData?: boolean;
	/** Prefer access token over API key for requests. Default: true. */
	useAccessToken?: boolean;
}

// ─── Poll data ────────────────────────────────────────────────────────────────

export interface PollData {
	/** Unix timestamp (seconds) of the last known offer change. */
	offersSince?: number;
	/** Map of sent offer ID → last known ETradeOfferState. */
	sent?: Record<string, ETradeOfferState>;
	/** Map of received offer ID → last known ETradeOfferState. */
	received?: Record<string, ETradeOfferState>;
	/** Arbitrary per-offer data keyed by offer ID. */
	offerData?: Record<string, Record<string, unknown>>;
	/** Map of offer ID → unix timestamp (seconds) when it was created. */
	timestamps?: Record<string, number>;
}

// ─── Raw API offer shape ──────────────────────────────────────────────────────

export interface RawTradeOffer {
	tradeofferid: string;
	accountid_other: number;
	message: string;
	trade_offer_state: ETradeOfferState;
	items_to_give?: RawTradeItem[];
	items_to_receive?: RawTradeItem[];
	is_our_offer: boolean;
	time_created: number;
	time_updated: number;
	expiration_time: number;
	tradeid?: string;
	from_real_time_trade: boolean;
	confirmation_method?: number;
	escrow_end_date?: number;
}

export interface RawTradeItem {
	appid: number;
	contextid: string;
	assetid?: string;
	id?: string;
	classid: string;
	instanceid?: string;
	amount?: number;
	[key: string]: unknown;
}

// ─── API call method options ──────────────────────────────────────────────────

export interface ApiCallMethod {
	iface: string;
	method: string;
}

// ─── Trade receipt item (from page scraping) ─────────────────────────────────

export interface ReceiptItem {
	appid: number;
	classid: string;
	instanceid?: string;
	[key: string]: unknown;
}

// ─── User details ─────────────────────────────────────────────────────────────

export interface TradeUserDetails {
	personaName: string;
	contexts: unknown;
	escrowDays?: number;
	avatarIcon?: string;
	avatarMedium?: string;
	avatarFull?: string;
	probation?: boolean;
}

// ─── EconItem tag shape ───────────────────────────────────────────────────────

export interface EconItemTag {
	internal_name: string;
	name: string;
	localized_tag_name: string;
	category: string;
	color: string;
	category_name: string;
	localized_category_name: string;
}

// ─── EconItem description line ────────────────────────────────────────────────

export interface EconItemDescription {
	type: string;
	value: string;
	color?: string;
	app_data?: unknown;
}

// ─── Asset properties ─────────────────────────────────────────────────────────

export interface AssetProperties {
	paint_seed?: number;
	float_value?: number;
	charm_template?: number | string;
	nametag?: string;
	item_certificate?: string;
	finish_catalog?: number | string;
}

export interface AssetAccessory {
	classid: string;
	sticker_wear?: number;
}

export interface RawAssetPropertiesEntry {
	asset_properties?: Array<{
		propertyid: number;
		int_value?: string | number;
		float_value?: string | number;
		string_value?: string;
	}>;
	asset_accessories?: Array<{
		classid: string;
		parent_relationship_properties?: Array<{
			propertyid: number;
			float_value?: string | number;
		}>;
	}>;
}
