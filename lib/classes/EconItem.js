"use strict";

module.exports = EconItem;

function EconItem(item, assetProperties) {
	for (let thing in item) {
		if (item.hasOwnProperty(thing)) {
			this[thing] = item[thing];
		}
	}

	// Use passed assetProperties or item.asset_properties (same shape: { asset_properties: [], asset_accessories: [] })
	var rawProps = assetProperties || this.asset_properties;

	// Main asset_properties: 1 = paint_seed, 2 = float_value, 3 = charm_template, 5 = nametag, 6 = item_certificate, 7 = finish_catalog
	// propertyid 4 = sticker_wear lives in asset_accessories[].parent_relationship_properties
	this.asset_properties = {};
	if (rawProps && rawProps.asset_properties && Array.isArray(rawProps.asset_properties)) {
		var props = rawProps.asset_properties;
		for (var i = 0; i < props.length; i++) {
			var p = props[i];
			if (p.propertyid === 1 && p.int_value !== undefined) {
				this.asset_properties.paint_seed = parseInt(p.int_value, 10);
			} else if (p.propertyid === 2 && p.float_value !== undefined) {
				this.asset_properties.float_value = parseFloat(p.float_value);
			} else if (p.propertyid === 3 && (p.int_value !== undefined || p.string_value !== undefined)) {
				this.asset_properties.charm_template = p.int_value !== undefined ? parseInt(p.int_value, 10) : p.string_value;
			} else if (p.propertyid === 5 && p.string_value !== undefined) {
				this.asset_properties.nametag = p.string_value;
			} else if (p.propertyid === 6 && p.string_value !== undefined) {
				this.asset_properties.item_certificate = p.string_value;
			} else if (p.propertyid === 7 && (p.int_value !== undefined || p.string_value !== undefined)) {
				this.asset_properties.finish_catalog = p.int_value !== undefined ? parseInt(p.int_value, 10) : p.string_value;
			}
		}
	}

	// asset_accessories: each has parent_relationship_properties; propertyid 4 = sticker_wear (float)
	this.asset_accessories = [];
	if (rawProps && rawProps.asset_accessories && Array.isArray(rawProps.asset_accessories)) {
		for (var j = 0; j < rawProps.asset_accessories.length; j++) {
			var acc = rawProps.asset_accessories[j];
			var parsed = { classid: acc.classid };
			var relProps = acc.parent_relationship_properties;
			if (relProps && Array.isArray(relProps)) {
				for (var k = 0; k < relProps.length; k++) {
					var rp = relProps[k];
					if (rp.propertyid === 4 && rp.float_value !== undefined) {
						parsed.sticker_wear = parseFloat(rp.float_value);
						break;
					}
				}
			}
			this.asset_accessories.push(parsed);
		}
	}

	if (this.id || this.assetid) {
		this.assetid = this.id = (this.id || this.assetid).toString();
	} else if (this.currencyid) {
		this.currencyid = this.currencyid.toString();
	}

	this.appid = this.appid ? parseInt(this.appid, 10) : 0;
	this.classid = this.classid.toString();
	this.instanceid = (this.instanceid || 0).toString();
	this.amount = this.amount ? parseInt(this.amount, 10) : 1;
	this.contextid = this.contextid.toString();

	this.fraudwarnings = fixArray(this.fraudwarnings);
	this.descriptions = fixArray(this.descriptions);
	this.owner_descriptions = fixArray(this.owner_descriptions);
	this.actions = fixArray(this.actions);
	this.owner_actions = fixArray(this.owner_actions);
	this.market_actions = fixArray(this.market_actions);
	this.tags = fixTags(this.tags);

	this.tradable = fixBool(this.tradable);
	this.marketable = fixBool(this.marketable);
	this.commodity = fixBool(this.commodity);
	this.market_tradable_restriction = (this.market_tradable_restriction ? parseInt(this.market_tradable_restriction, 10) : 0);
	this.market_marketable_restriction = (this.market_marketable_restriction ? parseInt(this.market_marketable_restriction, 10) : 0);

	if (this.appid == 753 && !this.market_fee_app && this.market_hash_name) {
		var match = this.market_hash_name.match(/^(\d+)\-/);
		if (match) {
			this.market_fee_app = parseInt(match[1], 10);
		}
	}
}

function fixBool(val) {
	return typeof val == 'boolean' ? val : !!parseInt(val, 10);
}

function fixArray(obj) {
	if (typeof obj === 'undefined' || obj == '') {
		return [];
	}

	var array = [];
	for (var i in obj) {
		if (obj.hasOwnProperty(i)) {
			array[i] = obj[i];
		}
	}

	return array;
}

function fixTags(tags) {
	if (!(tags instanceof Array)) {
		tags = fixArray(tags);
	}

	return tags.map((tag) => {
		// tag.internal_name is always present
		// tag.category is always present
		tag.name = tag.localized_tag_name = (tag.localized_tag_name || tag.name);
		tag.color = tag.color || "";
		tag.category_name = tag.localized_category_name = (tag.localized_category_name || tag.category_name);
		return tag;
	});
}

EconItem.prototype.getImageURL = function() {
	return "https://steamcommunity-a.akamaihd.net/economy/image/" + this.icon_url + "/";
};

EconItem.prototype.getLargeImageURL = function() {
	if (!this.icon_url_large) {
		return this.getImageURL();
	}

	return "https://steamcommunity-a.akamaihd.net/economy/image/" + this.icon_url_large + "/";
};

EconItem.prototype.getTag = function(category) {
	if (!this.tags) {
		return null;
	}

	for (let i = 0; i < this.tags.length; i++) {
		if (this.tags[i].category == category) {
			return this.tags[i];
		}
	}

	return null;
};
