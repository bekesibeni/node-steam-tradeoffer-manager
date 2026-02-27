import { EventEmitter } from 'events';
import { promises as FS } from 'fs';
import * as Path from 'path';
import * as Zlib from 'zlib';
import { LeastUsedCache } from '@doctormckay/stdlib/data_structures';
import { appDataDirectory } from '@doctormckay/stdlib/os';
import { getLanguageInfo } from 'languages';
import { SteamCommunity } from 'steamcommunity';
import SteamID from 'steamid';

import { ETradeOfferState } from './resources/ETradeOfferState';
import { EOfferFilter } from './resources/EOfferFilter';
import { EResult } from './resources/EResult';
import { EConfirmationMethod } from './resources/EConfirmationMethod';
import { ETradeStatus } from './resources/ETradeStatus';

import type {
	TradeOfferManagerOptions,
	PollData,
	SimpleCallback,
} from './types';

// ─── Static enum / constant references ───────────────────────────────────────

export {
	SteamID,
	ETradeOfferState,
	EOfferFilter,
	EResult,
	EConfirmationMethod,
	ETradeStatus,
};

// ─── Main class ───────────────────────────────────────────────────────────────

export class TradeOfferManager extends EventEmitter {

	// ── Static enum references (mirrors original static props) ────────────────
	static readonly SteamID = SteamID;
	static readonly ETradeOfferState = ETradeOfferState;
	static readonly EOfferFilter = EOfferFilter;
	static readonly EResult = EResult;
	static readonly EConfirmationMethod = EConfirmationMethod;
	static readonly ETradeStatus = ETradeStatus;

	// ── Public instance state ─────────────────────────────────────────────────
	steamID: SteamID | null = null;
	apiKey: string | null = null;
	accessToken: string | null = null;
	useAccessToken: boolean;
	pollData: PollData;
	pollInterval: number;
	minimumPollInterval: number;
	pollFullUpdateInterval: number;
	cancelTime?: number;
	pendingCancelTime?: number;
	cancelOfferCount?: number;
	cancelOfferCountMinAge: number;

	// ── Internal state ─────────────────────────────────────────────────────────
	_steam: EventEmitter | null;
	_community: SteamCommunity;
	_domain: string;
	_language: string | null;
	_languageName: string | null;
	_pollTimer: ReturnType<typeof setTimeout> | null = null;
	_lastPoll = 0;
	_lastPollFullUpdate = 0;
	_pendingOfferSendResponses = 0;
	_dataGzip: boolean;
	_dataDirectory: string | null = null;
	_assetCache: LeastUsedCache;
	_getPollDataFromDisk?: boolean;

	constructor(options: TradeOfferManagerOptions = {}) {
		super();

		this._steam = options.steam ?? null;
		this._domain = options.domain ?? 'localhost';
		this._language = null;
		this._languageName = null;

		if (this._domain === 'doctormckay.com' && !process.env['MCKAY_BOX']) {
			throw new Error("Please fill in your own domain. I'm pretty sure you don't own doctormckay.com.");
		}

		this._community = options.community ?? new SteamCommunity();
		this._dataGzip = options.gzipData ?? false;

		const assetCacheSize = options.assetCacheMaxItems ?? 500;
		const assetCacheGcInterval = options.assetCacheGcInterval ?? 120_000;

		if (options.globalAssetCache) {
			(global as Record<string, unknown>)['_steamTradeOfferManagerAssetCache'] ??=
				new LeastUsedCache(assetCacheSize, assetCacheGcInterval);
			this._assetCache = (global as Record<string, unknown>)['_steamTradeOfferManagerAssetCache'] as LeastUsedCache;
		} else {
			this._assetCache = new LeastUsedCache(assetCacheSize, assetCacheGcInterval);
		}

		// Disk persistence
		let dataDir = options.dataDirectory;
		if (dataDir === undefined) {
			if (process.env['OPENSHIFT_DATA_DIR']) {
				dataDir = process.env['OPENSHIFT_DATA_DIR'] + '/node-steam-tradeoffer-manager';
			} else {
				dataDir = appDataDirectory({ appName: 'node-steam-tradeoffer-manager', appAuthor: 'doctormckay' });
			}
		}

		if (dataDir) {
			this._dataDirectory = dataDir;
			FS.mkdir(dataDir, { recursive: true }).catch(() => undefined);
		}

		this.pollInterval = options.pollInterval ?? 30_000;
		this.minimumPollInterval = options.minimumPollInterval ?? 1_000;
		this.pollFullUpdateInterval = options.pollFullUpdateInterval ?? 120_000;
		this.cancelTime = options.cancelTime;
		this.pendingCancelTime = options.pendingCancelTime;
		this.cancelOfferCount = options.cancelOfferCount;
		this.cancelOfferCountMinAge = options.cancelOfferCountMinAge ?? 0;

		// Sanity-check poll intervals
		const sanityChecks: Record<string, number> = {
			pollInterval: 1_000,
			minimumPollInterval: 1_000,
			pollFullUpdateInterval: 1_000,
		};
		for (const [key, min] of Object.entries(sanityChecks)) {
			const val = (this as unknown as Record<string, number>)[key]!;
			if (key === 'pollInterval' && val < 0) continue;
			if (val < min) {
				this._warn(`Option ${key} failed sanity check: provided value (${val}) is too low. ${key} has been forced to ${min}.`);
				(this as unknown as Record<string, number>)[key] = min;
			}
		}

		this.pollData = options.pollData ?? {};
		this.useAccessToken = options.useAccessToken !== false;

		// Language mapping
		if (options.language) {
			const lang = options.language;
			if (lang === 'szh') {
				this._language = 'zh';
				this._languageName = 'schinese';
			} else if (lang === 'tzh') {
				this._language = 'zh';
				this._languageName = 'tchinese';
			} else if (lang === 'br') {
				this._language = 'pt-BR';
				this._languageName = 'brazilian';
			} else {
				const info = getLanguageInfo(lang);
				if (!info.name) {
					this._language = null;
					this._languageName = null;
				} else {
					this._language = lang;
					this._languageName = info.name.toLowerCase();
				}
			}
		}

		// Steam-user event hooks
		if (this._steam) {
			this._steam.on('tradeOffers', () => { this.doPoll(); });
			this._steam.on('newItems', () => { this.doPoll(); });
		}

		// Auto-save poll data
		if (options.savePollData) {
			this._getPollDataFromDisk = true;
			this.on('pollData', (pollData: PollData) => {
				if (this.steamID) {
					this._persistToDisk('polldata_' + this.steamID + '.json', JSON.stringify(pollData));
				}
			});
		}
	}

	// ─── Cookie / session setup ───────────────────────────────────────────────

	setCookies(cookies: string[], familyViewPin?: string | SimpleCallback | null, callback?: SimpleCallback): void {
		if (typeof familyViewPin === 'function') {
			callback = familyViewPin;
			familyViewPin = null;
		}

		try {
			const loginSecureCookie = cookies.find((c) => c.startsWith('steamLoginSecure='));
			if (!loginSecureCookie) throw new Error('steamLoginSecure cookie not found');

			const match = loginSecureCookie.match(/steamLoginSecure=([^;]+)/);
			if (!match) throw new Error('steamLoginSecure cookie is malformed');

			const cookieValue = decodeURIComponent(match[1]!.trim());
			const accessToken = cookieValue.split('||')[1];
			if (!accessToken) throw new Error('Access token not found');
			this.accessToken = accessToken;
		} catch (ex) {
			if (this.useAccessToken) {
				callback?.(ex as Error);
				return;
			}
		}

		this._community.setCookies(cookies);
		this.steamID = this._community.steamID;

		if (this._getPollDataFromDisk) {
			delete this._getPollDataFromDisk;
			const filename = 'polldata_' + this.steamID + '.json';
			this._getFromDisk([filename], (_err, files) => {
				if (files[filename]) {
					try {
						this.pollData = JSON.parse(files[filename]!.toString('utf8')) as PollData;
					} catch (ex) {
						this.emit('debug', 'Error parsing poll data from disk: ' + (ex as Error).message);
					}
				}
			});
		}

		const finish = (err?: Error | null): void => {
			let hadError = !!err;
			if (hadError && err!.message === 'No API key created for this account' && this.accessToken) {
				hadError = false;
				if (!this.useAccessToken) {
					this._warn(
						'An API key has not been created for this account; access token will be used instead for API requests.' +
						'\n    For more information, see: https://github.com/DoctorMcKay/node-steam-tradeoffer-manager/wiki/Access-Tokens' +
						'\n    To disable this warning, create an API key or set useAccessToken to true in TradeOfferManager options.',
					);
				}
			}

			if (hadError) { callback?.(err!); return; }

			if (this._languageName) {
				this._community.setCookies(['Steam_Language=' + this._languageName]);
			}

			clearTimeout(this._pollTimer ?? undefined);

			if (this.pollInterval >= 0) {
				this.doPoll();
			}

			callback?.(null);
		};

		if (familyViewPin) {
			this.parentalUnlock(familyViewPin as string, (err) => {
				if (err) { callback?.(err); return; }
				if (this.accessToken && this.useAccessToken) { finish(); }
				else { this._checkApiKey(finish); }
			});
		} else {
			if (this.accessToken && this.useAccessToken) { finish(); }
			else { this._checkApiKey(finish); }
		}
	}

	shutdown(): void {
		clearTimeout(this._pollTimer ?? undefined);
		this._community = new SteamCommunity();
		this._steam = null;
		this.apiKey = null;
		this.accessToken = null;
	}

	parentalUnlock(pin: string, callback?: SimpleCallback): void {
		this._community.parentalUnlock(pin, (err) => { callback?.(err ?? null); });
	}

	_checkApiKey(callback: (err?: Error | null) => void): void {
		if (this.apiKey) { callback(); return; }

		// First arg is the "unused" domain param (kept for backward compat in steamcommunity)
		this._community.getWebApiKey(null, (err, key) => {
			if (err) { callback(err); return; }
			this.apiKey = key ?? null;
			callback();
		});
	}

	// ─── Disk persistence ─────────────────────────────────────────────────────

	_persistToDisk(filename: string, content: string | Buffer): void {
		if (!this._dataDirectory) return;

		const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
		const filePath = Path.join(this._dataDirectory, filename);

		if (this._dataGzip) {
			Zlib.gzip(buf, (err, data) => {
				if (err) {
					this.emit('debug', `Cannot gzip ${filename}: ${err.message}`);
				} else {
					FS.writeFile(filePath + '.gz', data).catch((e: Error) => {
						this.emit('debug', `Cannot write ${filename}.gz: ${e.message}`);
					});
				}
			});
		} else {
			FS.writeFile(filePath, buf).catch((e: Error) => {
				this.emit('debug', `Cannot write ${filename}: ${e.message}`);
			});
		}
	}

	_getFromDisk(filenames: string[], callback: (err: Error | null, files: Record<string, Buffer>) => void): void {
		if (!this._dataDirectory) { callback(null, {}); return; }

		const requestedFilenames = this._dataGzip ? filenames.map((n) => n + '.gz') : filenames;

		const readPromises = requestedFilenames.map((filename) =>
			FS.readFile(Path.join(this._dataDirectory!, filename))
				.then((contents) => ({ filename, contents }))
				.catch(() => null),
		);

		Promise.all(readPromises).then((results) => {
			const files: Record<string, Buffer> = {};
			for (const file of results) {
				if (file?.contents) files[file.filename] = file.contents;
			}

			if (!this._dataGzip) { callback(null, files); return; }

			const keys = Object.keys(files);
			if (keys.length === 0) { callback(null, {}); return; }

			const gunzipped: Record<string, Buffer> = {};
			let pending = keys.length;

			for (const filename of keys) {
				Zlib.gunzip(files[filename]!, (gunzipErr, data) => {
					if (!gunzipErr) gunzipped[filename] = data;
					if (--pending === 0) {
						const renamed: Record<string, Buffer> = {};
						for (const [k, v] of Object.entries(gunzipped)) {
							renamed[k.replace(/\.gz$/, '')] = v;
						}
						callback(null, renamed);
					}
				});
			}
		}).catch((err: Error) => callback(err, {}));
	}

	// ─── Inventory helpers ────────────────────────────────────────────────────

	getInventoryContents(
		appid: number,
		contextid: number,
		tradableOnly: boolean,
		callback: (err: Error | null, items?: import('./classes/EconItem').EconItem[], currency?: import('./classes/EconItem').EconItem[], totalCount?: number) => void,
	): void {
		if (!this.steamID) { callback(new Error('Not Logged In')); return; }
		this.getUserInventoryContents(this.steamID, appid, contextid, tradableOnly, callback);
	}

	getUserInventoryContents(
		sid: SteamID | string,
		appid: number,
		contextid: number,
		tradableOnly: boolean,
		callback: (err: Error | null, items?: import('./classes/EconItem').EconItem[], currency?: import('./classes/EconItem').EconItem[], totalCount?: number) => void,
	): void {
		this._community.getUserInventoryContents(sid, appid, contextid, tradableOnly, this._languageName ?? 'english', callback);
	}

	getOfferToken(callback: (err: Error | null, token?: string) => void): void {
		this._community.getTradeURL((err, _url, token) => {
			if (err) { callback(err); return; }
			callback(null, token);
		});
	}

	getOffersContainingItems(
		items: import('./classes/EconItem').EconItem | import('./classes/EconItem').EconItem[],
		includeInactive: boolean | ((err: Error | null, sent?: import('./classes/TradeOffer').TradeOffer[], received?: import('./classes/TradeOffer').TradeOffer[]) => void),
		callback?: (err: Error | null, sent?: import('./classes/TradeOffer').TradeOffer[], received?: import('./classes/TradeOffer').TradeOffer[]) => void,
	): void {
		if (typeof includeInactive === 'function') {
			callback = includeInactive;
			includeInactive = false;
		}

		const itemArray = Array.isArray(items) ? items : [items];

		this.getOffers(includeInactive ? EOfferFilter.All : EOfferFilter.ActiveOnly, (err, sent, received) => {
			if (err) { callback!(err); return; }
			const filterFunc = (offer: import('./classes/TradeOffer').TradeOffer) =>
				itemArray.some((item) => this._itemEquals(offer, item));
			callback!(null, sent!.filter(filterFunc), received!.filter(filterFunc));
		});
	}

	// ─── Internal utility ─────────────────────────────────────────────────────

	_notifySessionExpired(err: Error): void {
		this.emit('sessionExpired', err);
		this._community._notifySessionExpired(err);
	}

	_warn(msg: string): void {
		process.emitWarning(msg, 'Warning', 'steam-tradeoffer-manager');
	}

	// Internal helper used by getOffersContainingItems
	private _itemEquals(offer: import('./classes/TradeOffer').TradeOffer, item: import('./classes/EconItem').EconItem): boolean {
		return offer.containsItem(item);
	}

}
