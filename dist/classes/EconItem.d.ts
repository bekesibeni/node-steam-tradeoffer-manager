import type { EconItemTag, EconItemDescription, AssetProperties, AssetAccessory, RawAssetPropertiesEntry } from '../types';
export declare class EconItem {
    appid: number;
    contextid: string;
    assetid: string;
    id: string;
    classid: string;
    instanceid: string;
    amount: number;
    currencyid?: string;
    icon_url?: string;
    icon_url_large?: string;
    name?: string;
    market_name?: string;
    market_hash_name?: string;
    type?: string;
    background_color?: string;
    name_color?: string;
    tradable: boolean;
    marketable: boolean;
    commodity: boolean;
    market_tradable_restriction: number;
    market_marketable_restriction: number;
    market_fee_app?: number;
    fraudwarnings: string[];
    descriptions: EconItemDescription[];
    owner_descriptions: EconItemDescription[];
    actions: Array<{
        link?: string;
        name?: string;
    }>;
    owner_actions: Array<{
        link?: string;
        name?: string;
    }>;
    market_actions: Array<{
        link?: string;
        name?: string;
    }>;
    tags: EconItemTag[];
    asset_properties: AssetProperties;
    asset_accessories: AssetAccessory[];
    [key: string]: unknown;
    constructor(item: Record<string, unknown>, assetProperties?: RawAssetPropertiesEntry);
    getImageURL(): string;
    getLargeImageURL(): string;
    getTag(category: string): EconItemTag | null;
}
//# sourceMappingURL=EconItem.d.ts.map