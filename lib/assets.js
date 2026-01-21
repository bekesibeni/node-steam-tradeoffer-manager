"use strict";

const TradeOfferManager = require('./index.js');
const EconItem = require('./classes/EconItem.js');

const ITEMS_PER_CLASSINFO_REQUEST = 100;

TradeOfferManager.prototype._digestDescriptions = function(descriptions) {
	var cache = this._assetCache;

	if (!this._language) {
		return;
	}

	if (descriptions && !(descriptions instanceof Array)) {
		descriptions = Object.keys(descriptions).map(key => descriptions[key]);
	}

	(descriptions || []).forEach((item) => {
		if (!item || !item.appid || !item.classid) {
			return;
		}

		cache.add(`${item.appid}_${item.classid}_${item.instanceid || '0'}`, item);
		this._persistToDisk(`asset_${item.appid}_${item.classid}_${item.instanceid || '0'}.json`, JSON.stringify(item));
	});
};

TradeOfferManager.prototype._mapItemsToDescriptions = function(appid, contextid, items) {
	var cache = this._assetCache;

	if (!(items instanceof Array)) {
		items = Object.keys(items).map(key => items[key]);
	}

	return items.map((item) => {
		item.appid = appid || item.appid;
		item.contextid = contextid || item.contextid;
		item.assetid = item.id = (item.id || item.assetid).toString();

		var key = `${item.appid}_${item.classid}_${item.instanceid || '0'}`;
		var descriptionCacheEntry = cache.get(key);
		if (!descriptionCacheEntry) {
			// This item isn't in our description cache
			return new EconItem(item);
		}

		for (let i in descriptionCacheEntry) {
			// don't overwrite properties that already exist on the item since steam has been known to include bad
			// data like assetid in the description
			if (descriptionCacheEntry.hasOwnProperty(i) && !item.hasOwnProperty(i)) {
				item[i] = descriptionCacheEntry[i];
			}
		}

		return new EconItem(item);
	});
};

TradeOfferManager.prototype._hasDescription = function(item, appid) {
	appid = appid || item.appid;
	return !!this._assetCache.get(appid + '_' + item.classid + '_' + (item.instanceid || '0'));
};

TradeOfferManager.prototype._addDescriptions = function(items, callback) {
	var descriptionRequired = items.filter(item => !this._hasDescription(item));

	if (descriptionRequired.length == 0) {
		callback(null, this._mapItemsToDescriptions(null, null, items));
		return;
	}

	this._requestDescriptions(descriptionRequired, (err) => {
		if (err) {
			callback(err);
		} else {
			callback(null, this._mapItemsToDescriptions(null, null, items));
		}
	});
};

TradeOfferManager.prototype._requestDescriptions = function(classes, callback) {
	var getFromSteam = () => {
		var apps = [];
		var appids = [];

		// Split this out into appids
		classes.forEach((item) => {
			// Don't add this if we already have it in the cache
			if (this._assetCache.get(`${item.appid}_${item.classid}_${item.instanceid || '0'}`)) {
				return;
			}

			var index = appids.indexOf(item.appid);
			if (index == -1) {
				index = appids.push(item.appid) - 1;
				var arr = [];
				arr.appid = item.appid;
				apps.push(arr);
			}

			// Don't add a class/instanceid pair that we already have in the list
			if (apps[index].indexOf(item.classid + '_' + (item.instanceid || '0')) == -1) {
				apps[index].push(item.classid + '_' + (item.instanceid || '0'));
			}
		});

		var self = this;

		var processAppAtIndex = function(appIndex) {
			if (appIndex >= apps.length) {
				// All apps processed
				callback();
				return;
			}

			var app = apps[appIndex];
			var chunks = [];
			var items = [];

			// Split this into chunks of ITEMS_PER_CLASSINFO_REQUEST items
			while (app.length > 0) {
				chunks.push(app.splice(0, ITEMS_PER_CLASSINFO_REQUEST));
			}

			var processChunkAtIndex = function(chunkIndex) {
				if (chunkIndex >= chunks.length) {
					// All chunks for this app processed, digest descriptions for this app
					if (items.length > 0) {
						self._digestDescriptions(items);
					}

					// Move on to next app
					processAppAtIndex(appIndex + 1);
					return;
				}

				var chunk = chunks[chunkIndex];
				var input = {
					"appid": app.appid,
					"language": self._language,
					"class_count": chunk.length
				};

				chunk.forEach((item, index) => {
					var parts = item.split('_');
					input['classid' + index] = parts[0];
					input['instanceid' + index] = parts[1];
				});

				self.emit('debug', "Requesting classinfo for " + chunk.length + " items from app " + app.appid);
				self._apiCall('GET', {
					"iface": "ISteamEconomy",
					"method": "GetAssetClassInfo"
				}, 1, input, (err, body) => {
					if (err) {
						callback(err);
						return;
					}

					if (!body.result || !body.result.success) {
						callback(new Error("Invalid API response"));
						return;
					}

					var chunkItems = Object.keys(body.result).map((id) => {
						if (!id.match(/^\d+(_\d+)?$/)) {
							return null;
						}

						var item = body.result[id];
						item.appid = app.appid;
						return item;
					}).filter(item => !!item);

					items = items.concat(chunkItems);

					// Process next chunk
					processChunkAtIndex(chunkIndex + 1);
				});
			};

			// Start processing chunks for this app
			processChunkAtIndex(0);
		};

		// Start processing apps
		processAppAtIndex(0);
	};

	// Get whatever we can from disk
	var filenames = classes.map(item => `asset_${item.appid}_${item.classid}_${item.instanceid || '0'}.json`);
	this._getFromDisk(filenames, (err, files) => {
		if (err) {
			getFromSteam();
			return;
		}

		for (var filename in files) {
			if (!files.hasOwnProperty(filename)) {
				continue;
			}

			var match = filename.match(/asset_(\d+_\d+_\d+)\.json/);
			if (!match) {
				this.emit('debug', "Shouldn't be possible, but filename " + filename + " doesn't match regex");
				continue; // shouldn't be possible
			}

			try {
				this._assetCache.add(match[1], JSON.parse(files[filename].toString('utf8')));
			} catch (ex) {
				this.emit('debug', "Error parsing description file " + filename + ": " + ex);
			}
		}

		// get the rest from steam
		getFromSteam();
	});
};
