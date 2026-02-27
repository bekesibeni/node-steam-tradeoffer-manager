"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EconItem = void 0;
class EconItem {
    // ── Core asset identifiers ──────────────────────────────────────────────
    appid;
    contextid;
    assetid;
    id;
    classid;
    instanceid;
    amount;
    currencyid;
    // ── Description fields (populated when language is set) ─────────────────
    icon_url;
    icon_url_large;
    name;
    market_name;
    market_hash_name;
    type;
    background_color;
    name_color;
    // ── Flags ────────────────────────────────────────────────────────────────
    tradable;
    marketable;
    commodity;
    market_tradable_restriction;
    market_marketable_restriction;
    market_fee_app;
    // ── Array fields ─────────────────────────────────────────────────────────
    fraudwarnings;
    descriptions;
    owner_descriptions;
    actions;
    owner_actions;
    market_actions;
    tags;
    // ── CS2 / game-specific parsed properties ────────────────────────────────
    asset_properties;
    asset_accessories;
    constructor(item, assetProperties) {
        // Copy all source properties onto this instance
        for (const key in item) {
            if (Object.prototype.hasOwnProperty.call(item, key)) {
                this[key] = item[key];
            }
        }
        // ── Parse asset_properties ────────────────────────────────────────────
        const rawProps = assetProperties || this.asset_properties;
        this.asset_properties = {};
        if (rawProps?.asset_properties && Array.isArray(rawProps.asset_properties)) {
            for (const p of rawProps.asset_properties) {
                if (p.propertyid === 1 && p.int_value !== undefined) {
                    this.asset_properties.paint_seed = parseInt(p.int_value, 10);
                }
                else if (p.propertyid === 2 && p.float_value !== undefined) {
                    this.asset_properties.float_value = parseFloat(p.float_value);
                }
                else if (p.propertyid === 3 && (p.int_value !== undefined || p.string_value !== undefined)) {
                    this.asset_properties.charm_template =
                        p.int_value !== undefined ? parseInt(p.int_value, 10) : p.string_value;
                }
                else if (p.propertyid === 5 && p.string_value !== undefined) {
                    this.asset_properties.nametag = p.string_value;
                }
                else if (p.propertyid === 6 && p.string_value !== undefined) {
                    this.asset_properties.item_certificate = p.string_value;
                }
                else if (p.propertyid === 7 && (p.int_value !== undefined || p.string_value !== undefined)) {
                    this.asset_properties.finish_catalog =
                        p.int_value !== undefined ? parseInt(p.int_value, 10) : p.string_value;
                }
            }
        }
        // ── Parse asset_accessories ───────────────────────────────────────────
        this.asset_accessories = [];
        if (rawProps?.asset_accessories && Array.isArray(rawProps.asset_accessories)) {
            for (const acc of rawProps.asset_accessories) {
                const parsed = { classid: acc.classid };
                if (acc.parent_relationship_properties && Array.isArray(acc.parent_relationship_properties)) {
                    for (const rp of acc.parent_relationship_properties) {
                        if (rp.propertyid === 4 && rp.float_value !== undefined) {
                            parsed.sticker_wear = parseFloat(rp.float_value);
                            break;
                        }
                    }
                }
                this.asset_accessories.push(parsed);
            }
        }
        // ── Normalize identifiers ─────────────────────────────────────────────
        if (this.id || this.assetid) {
            this.assetid = this.id = (this.id || this.assetid).toString();
        }
        else if (this.currencyid) {
            this.currencyid = this.currencyid.toString();
        }
        this.appid = this.appid ? parseInt(this.appid, 10) : 0;
        this.classid = this.classid.toString();
        this.instanceid = (this.instanceid ?? 0).toString();
        this.amount = this.amount ? parseInt(this.amount, 10) : 1;
        this.contextid = this.contextid.toString();
        // ── Normalize arrays ──────────────────────────────────────────────────
        this.fraudwarnings = fixArray(this.fraudwarnings);
        this.descriptions = fixArray(this.descriptions);
        this.owner_descriptions = fixArray(this.owner_descriptions);
        this.actions = fixArray(this.actions);
        this.owner_actions = fixArray(this.owner_actions);
        this.market_actions = fixArray(this.market_actions);
        this.tags = fixTags(this.tags);
        // ── Normalize flags ───────────────────────────────────────────────────
        this.tradable = fixBool(this.tradable);
        this.marketable = fixBool(this.marketable);
        this.commodity = fixBool(this.commodity);
        this.market_tradable_restriction = this.market_tradable_restriction
            ? parseInt(this.market_tradable_restriction, 10)
            : 0;
        this.market_marketable_restriction = this.market_marketable_restriction
            ? parseInt(this.market_marketable_restriction, 10)
            : 0;
        // ── Steam market fee app detection (appid 753 = Steam) ────────────────
        if (this.appid === 753 && !this.market_fee_app && this.market_hash_name) {
            const match = this.market_hash_name.match(/^(\d+)\-/);
            if (match) {
                this.market_fee_app = parseInt(match[1], 10);
            }
        }
    }
    getImageURL() {
        return 'https://steamcommunity-a.akamaihd.net/economy/image/' + (this.icon_url ?? '') + '/';
    }
    getLargeImageURL() {
        if (!this.icon_url_large) {
            return this.getImageURL();
        }
        return 'https://steamcommunity-a.akamaihd.net/economy/image/' + this.icon_url_large + '/';
    }
    getTag(category) {
        if (!this.tags)
            return null;
        for (const tag of this.tags) {
            if (tag.category === category)
                return tag;
        }
        return null;
    }
}
exports.EconItem = EconItem;
// ── Private helpers ──────────────────────────────────────────────────────────
function fixBool(val) {
    return typeof val === 'boolean' ? val : !!parseInt(val, 10);
}
function fixArray(obj) {
    if (obj === undefined || obj === '')
        return [];
    const array = [];
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            array[key] = obj[key];
        }
    }
    return array;
}
function fixTags(tags) {
    let arr;
    if (!Array.isArray(tags)) {
        arr = fixArray(tags);
    }
    else {
        arr = tags;
    }
    return arr.map((tag) => {
        tag.name = tag.localized_tag_name = tag.localized_tag_name || tag.name;
        tag.color = tag.color || '';
        tag.category_name = tag.localized_category_name = tag.localized_category_name || tag.category_name;
        return tag;
    });
}
//# sourceMappingURL=EconItem.js.map