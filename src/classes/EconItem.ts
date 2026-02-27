"use strict";

import type {
	EconItemTag,
	EconItemDescription,
	AssetProperties,
	AssetAccessory,
	RawAssetPropertiesEntry,
} from '../types';

export class EconItem {
	// ── Core asset identifiers ──────────────────────────────────────────────
	appid!: number;
	contextid!: string;
	assetid!: string;
	id!: string;
	classid!: string;
	instanceid!: string;
	amount!: number;
	currencyid?: string;

	// ── Description fields (populated when language is set) ─────────────────
	icon_url?: string;
	icon_url_large?: string;
	name?: string;
	market_name?: string;
	market_hash_name?: string;
	type?: string;
	background_color?: string;
	name_color?: string;

	// ── Flags ────────────────────────────────────────────────────────────────
	tradable!: boolean;
	marketable!: boolean;
	commodity!: boolean;
	market_tradable_restriction!: number;
	market_marketable_restriction!: number;
	market_fee_app?: number;

	// ── Array fields ─────────────────────────────────────────────────────────
	fraudwarnings!: string[];
	descriptions!: EconItemDescription[];
	owner_descriptions!: EconItemDescription[];
	actions!: Array<{ link?: string; name?: string }>;
	owner_actions!: Array<{ link?: string; name?: string }>;
	market_actions!: Array<{ link?: string; name?: string }>;
	tags!: EconItemTag[];

	// ── CS2 / game-specific parsed properties ────────────────────────────────
	asset_properties!: AssetProperties;
	asset_accessories!: AssetAccessory[];

	// Allow extra dynamic properties from the Steam API
	[key: string]: unknown;

	constructor(item: Record<string, unknown>, assetProperties?: RawAssetPropertiesEntry) {
		// Copy all source properties onto this instance
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) {
				(this as Record<string, unknown>)[key] = item[key];
			}
		}

		// ── Parse asset_properties ────────────────────────────────────────────
		const rawProps = assetProperties || (this.asset_properties as RawAssetPropertiesEntry | undefined);
		this.asset_properties = {};

		if (rawProps?.asset_properties && Array.isArray(rawProps.asset_properties)) {
			for (const p of rawProps.asset_properties) {
				if (p.propertyid === 1 && p.int_value !== undefined) {
					this.asset_properties.paint_seed = parseInt(p.int_value as string, 10);
				} else if (p.propertyid === 2 && p.float_value !== undefined) {
					this.asset_properties.float_value = parseFloat(p.float_value as string);
				} else if (p.propertyid === 3 && (p.int_value !== undefined || p.string_value !== undefined)) {
					this.asset_properties.charm_template =
						p.int_value !== undefined ? parseInt(p.int_value as string, 10) : p.string_value;
				} else if (p.propertyid === 5 && p.string_value !== undefined) {
					this.asset_properties.nametag = p.string_value;
				} else if (p.propertyid === 6 && p.string_value !== undefined) {
					this.asset_properties.item_certificate = p.string_value;
				} else if (p.propertyid === 7 && (p.int_value !== undefined || p.string_value !== undefined)) {
					this.asset_properties.finish_catalog =
						p.int_value !== undefined ? parseInt(p.int_value as string, 10) : p.string_value;
				}
			}
		}

		// ── Parse asset_accessories ───────────────────────────────────────────
		this.asset_accessories = [];
		if (rawProps?.asset_accessories && Array.isArray(rawProps.asset_accessories)) {
			for (const acc of rawProps.asset_accessories) {
				const parsed: AssetAccessory = { classid: acc.classid };
				if (acc.parent_relationship_properties && Array.isArray(acc.parent_relationship_properties)) {
					for (const rp of acc.parent_relationship_properties) {
						if (rp.propertyid === 4 && rp.float_value !== undefined) {
							parsed.sticker_wear = parseFloat(rp.float_value as string);
							break;
						}
					}
				}
				this.asset_accessories.push(parsed);
			}
		}

		// ── Normalize identifiers ─────────────────────────────────────────────
		if (this.id || this.assetid) {
			this.assetid = this.id = ((this.id || this.assetid) as string | number).toString();
		} else if (this.currencyid) {
			this.currencyid = (this.currencyid as string | number).toString();
		}

		this.appid = this.appid ? parseInt(this.appid as unknown as string, 10) : 0;
		this.classid = (this.classid as string | number).toString();
		this.instanceid = ((this.instanceid ?? 0) as string | number).toString();
		this.amount = this.amount ? parseInt(this.amount as unknown as string, 10) : 1;
		this.contextid = (this.contextid as string | number).toString();

		// ── Normalize arrays ──────────────────────────────────────────────────
		this.fraudwarnings = fixArray(this.fraudwarnings) as string[];
		this.descriptions = fixArray(this.descriptions) as EconItemDescription[];
		this.owner_descriptions = fixArray(this.owner_descriptions) as EconItemDescription[];
		this.actions = fixArray(this.actions) as Array<{ link?: string; name?: string }>;
		this.owner_actions = fixArray(this.owner_actions) as Array<{ link?: string; name?: string }>;
		this.market_actions = fixArray(this.market_actions) as Array<{ link?: string; name?: string }>;
		this.tags = fixTags(this.tags);

		// ── Normalize flags ───────────────────────────────────────────────────
		this.tradable = fixBool(this.tradable);
		this.marketable = fixBool(this.marketable);
		this.commodity = fixBool(this.commodity);
		this.market_tradable_restriction = this.market_tradable_restriction
			? parseInt(this.market_tradable_restriction as unknown as string, 10)
			: 0;
		this.market_marketable_restriction = this.market_marketable_restriction
			? parseInt(this.market_marketable_restriction as unknown as string, 10)
			: 0;

		// ── Steam market fee app detection (appid 753 = Steam) ────────────────
		if (this.appid === 753 && !this.market_fee_app && this.market_hash_name) {
			const match = (this.market_hash_name as string).match(/^(\d+)\-/);
			if (match) {
				this.market_fee_app = parseInt(match[1]!, 10);
			}
		}
	}

	getImageURL(): string {
		return 'https://steamcommunity-a.akamaihd.net/economy/image/' + (this.icon_url ?? '') + '/';
	}

	getLargeImageURL(): string {
		if (!this.icon_url_large) {
			return this.getImageURL();
		}
		return 'https://steamcommunity-a.akamaihd.net/economy/image/' + this.icon_url_large + '/';
	}

	getTag(category: string): EconItemTag | null {
		if (!this.tags) return null;
		for (const tag of this.tags) {
			if (tag.category === category) return tag;
		}
		return null;
	}
}

// ── Private helpers ──────────────────────────────────────────────────────────

function fixBool(val: unknown): boolean {
	return typeof val === 'boolean' ? val : !!parseInt(val as string, 10);
}

function fixArray(obj: unknown): unknown[] {
	if (obj === undefined || obj === '') return [];
	const array: unknown[] = [];
	for (const key in (obj as Record<string, unknown>)) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			(array as unknown as Record<string, unknown>)[key] = (obj as Record<string, unknown>)[key];
		}
	}
	return array;
}

function fixTags(tags: unknown): EconItemTag[] {
	let arr: EconItemTag[];
	if (!Array.isArray(tags)) {
		arr = fixArray(tags) as EconItemTag[];
	} else {
		arr = tags as EconItemTag[];
	}
	return arr.map((tag) => {
		tag.name = tag.localized_tag_name = tag.localized_tag_name || tag.name;
		tag.color = tag.color || '';
		tag.category_name = tag.localized_category_name = tag.localized_category_name || tag.category_name;
		return tag;
	});
}
