"use strict";

import { TradeOfferManager } from '../TradeOfferManager';
import { EconItem } from '../classes/EconItem';

const ITEMS_PER_CLASSINFO_REQUEST = 100;

declare module '../TradeOfferManager' {
	interface TradeOfferManager {
		_digestDescriptions(descriptions: Record<string, unknown>[] | Record<string, Record<string, unknown>> | null | undefined): void;
		_mapItemsToDescriptions(appid: number | null, contextid: string | null, items: Record<string, unknown>[]): EconItem[];
		_hasDescription(item: Record<string, unknown>, appid?: number): boolean;
		_addDescriptions(items: Record<string, unknown>[], callback: (err: Error | null, items?: EconItem[]) => void): void;
		_requestDescriptions(classes: Array<{ appid: number; classid: string; instanceid?: string }>, callback: (err?: Error | null) => void): void;
	}
}

TradeOfferManager.prototype._digestDescriptions = function (
	this: TradeOfferManager,
	descriptions: Record<string, unknown>[] | Record<string, Record<string, unknown>> | null | undefined,
): void {
	if (!this._language) return;

	let arr: Record<string, unknown>[];
	if (descriptions && !Array.isArray(descriptions)) {
		arr = Object.keys(descriptions).map((key) => (descriptions as Record<string, Record<string, unknown>>)[key]!);
	} else {
		arr = (descriptions as Record<string, unknown>[]) || [];
	}

	for (const item of arr) {
		if (!item || !item['appid'] || !item['classid']) continue;
		const key = `${item['appid']}_${item['classid']}_${item['instanceid'] ?? '0'}`;
		this._assetCache.add(key, item);
		this._persistToDisk(`asset_${key}.json`, JSON.stringify(item));
	}
};

TradeOfferManager.prototype._mapItemsToDescriptions = function (
	this: TradeOfferManager,
	appid: number | null,
	contextid: string | null,
	items: Record<string, unknown>[],
): EconItem[] {
	let arr: Record<string, unknown>[];
	if (!Array.isArray(items)) {
		arr = Object.keys(items).map((key) => (items as Record<string, Record<string, unknown>>)[key]!);
	} else {
		arr = items;
	}

	return arr.map((item) => {
		item['appid']    = appid    ?? item['appid'];
		item['contextid'] = contextid ?? item['contextid'];
		item['assetid'] = item['id'] = ((item['id'] ?? item['assetid']) as string | number).toString();

		const key = `${item['appid']}_${item['classid']}_${item['instanceid'] ?? '0'}`;
		const desc = this._assetCache.get(key);

		if (!desc) return new EconItem(item);

		for (const k in desc) {
			if (Object.prototype.hasOwnProperty.call(desc, k) && !Object.prototype.hasOwnProperty.call(item, k)) {
				item[k] = desc[k];
			}
		}
		return new EconItem(item);
	});
};

TradeOfferManager.prototype._hasDescription = function (
	this: TradeOfferManager,
	item: Record<string, unknown>,
	appid?: number,
): boolean {
	const aid = appid ?? item['appid'] as number;
	return !!this._assetCache.get(`${aid}_${item['classid']}_${item['instanceid'] ?? '0'}`);
};

TradeOfferManager.prototype._addDescriptions = function (
	this: TradeOfferManager,
	items: Record<string, unknown>[],
	callback: (err: Error | null, items?: EconItem[]) => void,
): void {
	const descriptionRequired = items.filter((item) => !this._hasDescription(item));

	if (descriptionRequired.length === 0) {
		callback(null, this._mapItemsToDescriptions(null, null, items));
		return;
	}

	this._requestDescriptions(
		descriptionRequired as Array<{ appid: number; classid: string; instanceid?: string }>,
		(err) => {
			if (err) {
				callback(err);
			} else {
				callback(null, this._mapItemsToDescriptions(null, null, items));
			}
		},
	);
};

TradeOfferManager.prototype._requestDescriptions = function (
	this: TradeOfferManager,
	classes: Array<{ appid: number; classid: string; instanceid?: string }>,
	callback: (err?: Error | null) => void,
): void {
	// ── Helper: type for arrays that carry an .appid property ──────────────
	type AppClassList = string[] & { appid: number };

	const getFromSteam = (): void => {
		const apps: AppClassList[] = [];
		const appids: number[] = [];

		for (const item of classes) {
			if (this._assetCache.get(`${item.appid}_${item.classid}_${item.instanceid ?? '0'}`)) continue;

			let idx = appids.indexOf(item.appid);
			if (idx === -1) {
				idx = appids.push(item.appid) - 1;
				const arr: AppClassList = [] as unknown as AppClassList;
				arr.appid = item.appid;
				apps.push(arr);
			}

			const pairKey = item.classid + '_' + (item.instanceid ?? '0');
			if (apps[idx]!.indexOf(pairKey) === -1) {
				apps[idx]!.push(pairKey);
			}
		}

		const processAppAtIndex = (appIndex: number): void => {
			if (appIndex >= apps.length) { callback(); return; }

			const app = apps[appIndex]!;
			let allPairs = [...app]; // copy
			const chunks: string[][] = [];
			while (allPairs.length > 0) {
				chunks.push(allPairs.splice(0, ITEMS_PER_CLASSINFO_REQUEST));
			}

			let collectedItems: Record<string, unknown>[] = [];

			const processChunkAtIndex = (chunkIndex: number): void => {
				if (chunkIndex >= chunks.length) {
					if (collectedItems.length > 0) this._digestDescriptions(collectedItems);
					processAppAtIndex(appIndex + 1);
					return;
				}

				const chunk = chunks[chunkIndex]!;
				const input: Record<string, unknown> = {
					appid:       app.appid,
					language:    this._language,
					class_count: chunk.length,
				};
				chunk.forEach((pairKey, i) => {
					const parts = pairKey.split('_');
					input[`classid${i}`]    = parts[0];
					input[`instanceid${i}`] = parts[1];
				});

				this.emit('debug', `Requesting classinfo for ${chunk.length} items from app ${app.appid}`);
				this._apiCall('GET', { iface: 'ISteamEconomy', method: 'GetAssetClassInfo' }, 1, input, (err, body) => {
					if (err) { callback(err); return; }

					const result = (body['result'] ?? {}) as Record<string, unknown>;
					if (!(result['success'])) { callback(new Error('Invalid API response')); return; }

					const chunkItems = Object.keys(result)
						.filter((id) => /^\d+(_\d+)?$/.test(id))
						.map((id) => {
							const item = { ...(result[id] as Record<string, unknown>), appid: app.appid };
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
	const filenames = classes.map(
		(item) => `asset_${item.appid}_${item.classid}_${item.instanceid ?? '0'}.json`,
	);

	this._getFromDisk(filenames, (err, files) => {
		if (err) { getFromSteam(); return; }

		for (const filename in files) {
			if (!Object.prototype.hasOwnProperty.call(files, filename)) continue;
			const match = filename.match(/asset_(\d+_\d+_\d+)\.json/);
			if (!match) {
				this.emit('debug', `Unexpected filename: ${filename}`);
				continue;
			}
			try {
				this._assetCache.add(match[1]!, JSON.parse(files[filename]!.toString('utf8')) as Record<string, unknown>);
			} catch (ex) {
				this.emit('debug', `Error parsing description file ${filename}: ${ex}`);
			}
		}
		getFromSteam();
	});
};
