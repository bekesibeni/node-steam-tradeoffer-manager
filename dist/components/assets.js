"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TradeOfferManager_1 = require("../TradeOfferManager");
const EconItem_1 = require("../classes/EconItem");
const ITEMS_PER_CLASSINFO_REQUEST = 100;
TradeOfferManager_1.TradeOfferManager.prototype._digestDescriptions = function (descriptions) {
    if (!this._language)
        return;
    let arr;
    if (descriptions && !Array.isArray(descriptions)) {
        arr = Object.keys(descriptions).map((key) => descriptions[key]);
    }
    else {
        arr = descriptions || [];
    }
    for (const item of arr) {
        if (!item || !item['appid'] || !item['classid'])
            continue;
        const key = `${item['appid']}_${item['classid']}_${item['instanceid'] ?? '0'}`;
        this._assetCache.add(key, item);
        this._persistToDisk(`asset_${key}.json`, JSON.stringify(item));
    }
};
TradeOfferManager_1.TradeOfferManager.prototype._mapItemsToDescriptions = function (appid, contextid, items) {
    let arr;
    if (!Array.isArray(items)) {
        arr = Object.keys(items).map((key) => items[key]);
    }
    else {
        arr = items;
    }
    return arr.map((item) => {
        item['appid'] = appid ?? item['appid'];
        item['contextid'] = contextid ?? item['contextid'];
        item['assetid'] = item['id'] = (item['id'] ?? item['assetid']).toString();
        const key = `${item['appid']}_${item['classid']}_${item['instanceid'] ?? '0'}`;
        const desc = this._assetCache.get(key);
        if (!desc)
            return new EconItem_1.EconItem(item);
        for (const k in desc) {
            if (Object.prototype.hasOwnProperty.call(desc, k) && !Object.prototype.hasOwnProperty.call(item, k)) {
                item[k] = desc[k];
            }
        }
        return new EconItem_1.EconItem(item);
    });
};
TradeOfferManager_1.TradeOfferManager.prototype._hasDescription = function (item, appid) {
    const aid = appid ?? item['appid'];
    return !!this._assetCache.get(`${aid}_${item['classid']}_${item['instanceid'] ?? '0'}`);
};
TradeOfferManager_1.TradeOfferManager.prototype._addDescriptions = function (items, callback) {
    const descriptionRequired = items.filter((item) => !this._hasDescription(item));
    if (descriptionRequired.length === 0) {
        callback(null, this._mapItemsToDescriptions(null, null, items));
        return;
    }
    this._requestDescriptions(descriptionRequired, (err) => {
        if (err) {
            callback(err);
        }
        else {
            callback(null, this._mapItemsToDescriptions(null, null, items));
        }
    });
};
TradeOfferManager_1.TradeOfferManager.prototype._requestDescriptions = function (classes, callback) {
    const getFromSteam = () => {
        const apps = [];
        const appids = [];
        for (const item of classes) {
            if (this._assetCache.get(`${item.appid}_${item.classid}_${item.instanceid ?? '0'}`))
                continue;
            let idx = appids.indexOf(item.appid);
            if (idx === -1) {
                idx = appids.push(item.appid) - 1;
                const arr = [];
                arr.appid = item.appid;
                apps.push(arr);
            }
            const pairKey = item.classid + '_' + (item.instanceid ?? '0');
            if (apps[idx].indexOf(pairKey) === -1) {
                apps[idx].push(pairKey);
            }
        }
        const processAppAtIndex = (appIndex) => {
            if (appIndex >= apps.length) {
                callback();
                return;
            }
            const app = apps[appIndex];
            let allPairs = [...app]; // copy
            const chunks = [];
            while (allPairs.length > 0) {
                chunks.push(allPairs.splice(0, ITEMS_PER_CLASSINFO_REQUEST));
            }
            let collectedItems = [];
            const processChunkAtIndex = (chunkIndex) => {
                if (chunkIndex >= chunks.length) {
                    if (collectedItems.length > 0)
                        this._digestDescriptions(collectedItems);
                    processAppAtIndex(appIndex + 1);
                    return;
                }
                const chunk = chunks[chunkIndex];
                const input = {
                    appid: app.appid,
                    language: this._language,
                    class_count: chunk.length,
                };
                chunk.forEach((pairKey, i) => {
                    const parts = pairKey.split('_');
                    input[`classid${i}`] = parts[0];
                    input[`instanceid${i}`] = parts[1];
                });
                this.emit('debug', `Requesting classinfo for ${chunk.length} items from app ${app.appid}`);
                this._apiCall('GET', { iface: 'ISteamEconomy', method: 'GetAssetClassInfo' }, 1, input, (err, body) => {
                    if (err) {
                        callback(err);
                        return;
                    }
                    const result = (body['result'] ?? {});
                    if (!(result['success'])) {
                        callback(new Error('Invalid API response'));
                        return;
                    }
                    const chunkItems = Object.keys(result)
                        .filter((id) => /^\d+(_\d+)?$/.test(id))
                        .map((id) => {
                        const item = { ...result[id], appid: app.appid };
                        return item;
                    });
                    collectedItems = collectedItems.concat(chunkItems);
                    processChunkAtIndex(chunkIndex + 1);
                });
            };
            processChunkAtIndex(0);
        };
        processAppAtIndex(0);
    };
    // ── First: load whatever we already have cached on disk ─────────────────
    const filenames = classes.map((item) => `asset_${item.appid}_${item.classid}_${item.instanceid ?? '0'}.json`);
    this._getFromDisk(filenames, (err, files) => {
        if (err) {
            getFromSteam();
            return;
        }
        for (const filename in files) {
            if (!Object.prototype.hasOwnProperty.call(files, filename))
                continue;
            const match = filename.match(/asset_(\d+_\d+_\d+)\.json/);
            if (!match) {
                this.emit('debug', `Unexpected filename: ${filename}`);
                continue;
            }
            try {
                this._assetCache.add(match[1], JSON.parse(files[filename].toString('utf8')));
            }
            catch (ex) {
                this.emit('debug', `Error parsing description file ${filename}: ${ex}`);
            }
        }
        getFromSteam();
    });
};
//# sourceMappingURL=assets.js.map