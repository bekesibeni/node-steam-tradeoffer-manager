"use strict";

import * as vm from 'vm';
import SteamID from 'steamid';

import { ETradeOfferState } from '../resources/ETradeOfferState';
import { EConfirmationMethod } from '../resources/EConfirmationMethod';
import { ETradeStatus } from '../resources/ETradeStatus';
import { itemEquals, makeAnError, processItems } from '../helpers';
import type { TradeOfferManager } from '../TradeOfferManager';
import { EconItem } from './EconItem';
import type { TradeUserDetails } from '../types';

// ── Minimal shape for items passed to addMyItem / addTheirItem ───────────────
export interface TradeItemInput {
	appid: number | string;
	contextid: string | number;
	assetid?: string | number;
	id?: string | number;
	amount?: number | string;
}

// ── Normalized item stored in itemsToGive / itemsToReceive before send ───────
interface TradeItemNormalized {
	id: string;
	assetid: string;
	appid: number;
	contextid: string;
	amount: number;
}

export class TradeOffer {
	// ── Public properties ─────────────────────────────────────────────────────
	partner: SteamID;
	id: string | null = null;
	message: string | null = null;
	state: ETradeOfferState = ETradeOfferState.Invalid;
	itemsToGive: EconItem[] = [];
	itemsToReceive: EconItem[] = [];
	isOurOffer: boolean | null = null;
	created: Date | null = null;
	updated: Date | null = null;
	expires: Date | null = null;
	tradeID: string | null = null;
	fromRealTimeTrade: boolean | null = null;
	confirmationMethod: EConfirmationMethod | null = null;
	escrowEnds: Date | null = null;
	rawJson = '';

	// ── Non-enumerable private properties (set via Object.defineProperties) ──
	/** @internal */ declare readonly manager: TradeOfferManager;
	/** @internal */ declare _countering: string | null;
	/** @internal */ declare _tempData: Record<string, unknown>;
	/** @internal */ declare _token: string | undefined;

	constructor(manager: TradeOfferManager, partner: string | SteamID, token?: string) {
		if (typeof partner === 'string') {
			this.partner = new SteamID(partner);
		} else {
			this.partner = partner;
		}

		if (!this.partner.isValid || !this.partner.isValid() || this.partner.type !== SteamID.Type.INDIVIDUAL) {
			throw new Error('Invalid input SteamID ' + this.partner);
		}

		// Use Object.defineProperties to keep internal props non-enumerable
		// (so they don't appear in JSON.stringify / for...in)
		Object.defineProperties(this, {
			_countering: { configurable: true, enumerable: false, writable: true, value: null },
			_tempData:   { configurable: true, enumerable: false, writable: true, value: {} },
			_token:      { configurable: true, enumerable: false, writable: true, value: token },
			manager:     { configurable: false, enumerable: false, writable: false, value: manager },
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Public methods
	// ─────────────────────────────────────────────────────────────────────────

	isGlitched(): boolean {
		if (!this.id) return false;
		if (this.itemsToGive.length + this.itemsToReceive.length === 0) return true;
		if (this.manager._language && this.itemsToGive.concat(this.itemsToReceive).some((item) => !item.name)) {
			return true;
		}
		return false;
	}

	containsItem(item: TradeItemInput): boolean {
		return this.itemsToGive.concat(this.itemsToReceive).some((offerItem) =>
			itemEquals(offerItem as unknown as import('../types').RawTradeItem, item as unknown as import('../types').RawTradeItem),
		);
	}

	/** Get / set arbitrary per-offer data that is persisted in pollData. */
	data(): Record<string, unknown>;
	data(key: string): unknown;
	data(key: string, value: unknown): void;
	data(...args: [] | [string] | [string, unknown]): Record<string, unknown> | unknown | void {
		const pollData = this.manager.pollData;

		if (args.length === 0) {
			if (!this.id) return this._tempData;
			return (pollData.offerData && pollData.offerData[this.id]) ?? {};
		}

		const [key, value] = args as [string, unknown];

		if (args.length === 1) {
			if (!this.id) return this._tempData[key];
			return pollData.offerData?.[this.id]?.[key];
		}

		// Setting value
		if (key === 'cancelTime') {
			if (!this.isOurOffer) {
				throw new Error(`Cannot set cancelTime for offer #${this.id} as we did not send it.`);
			}
			if (
				this.id &&
				this.state !== ETradeOfferState.Active &&
				this.state !== ETradeOfferState.CreatedNeedsConfirmation
			) {
				throw new Error(
					`Cannot set cancelTime for offer #${this.id} as it is not active (${ETradeOfferState[this.state]}).`,
				);
			}
		}

		if (!this.id) {
			this._tempData[key] = value;
			return;
		}

		pollData.offerData = pollData.offerData ?? {};
		pollData.offerData[this.id] = pollData.offerData[this.id] ?? {};
		pollData.offerData[this.id]![key] = value;
		this.manager.emit('pollData', pollData);
	}

	getPartnerInventoryContents(
		appid: number,
		contextid: number,
		callback: (err: Error | null, items?: EconItem[], currency?: EconItem[], totalCount?: number) => void,
	): void {
		this.manager.getUserInventoryContents(this.partner, appid, contextid, true, callback);
	}

	addMyItem(item: TradeItemInput): boolean {
		return addItem(item, this, this.itemsToGive);
	}

	addMyItems(items: TradeItemInput[]): number {
		let added = 0;
		for (const item of items) {
			if (this.addMyItem(item)) added++;
		}
		return added;
	}

	removeMyItem(item: TradeItemInput): boolean {
		if (this.id) throw new Error('Cannot remove items from an already-sent offer');
		for (let i = 0; i < this.itemsToGive.length; i++) {
			if (itemEquals(this.itemsToGive[i] as unknown as import('../types').RawTradeItem, item as unknown as import('../types').RawTradeItem)) {
				this.itemsToGive.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	removeMyItems(items: TradeItemInput[]): number {
		let removed = 0;
		for (const item of items) {
			if (this.removeMyItem(item)) removed++;
		}
		return removed;
	}

	addTheirItem(item: TradeItemInput): boolean {
		return addItem(item, this, this.itemsToReceive);
	}

	addTheirItems(items: TradeItemInput[]): number {
		let added = 0;
		for (const item of items) {
			if (this.addTheirItem(item)) added++;
		}
		return added;
	}

	removeTheirItem(item: TradeItemInput): boolean {
		if (this.id) throw new Error('Cannot remove items from an already-sent offer');
		for (let i = 0; i < this.itemsToReceive.length; i++) {
			if (itemEquals(this.itemsToReceive[i] as unknown as import('../types').RawTradeItem, item as unknown as import('../types').RawTradeItem)) {
				this.itemsToReceive.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	removeTheirItems(items: TradeItemInput[]): number {
		let removed = 0;
		for (const item of items) {
			if (this.removeTheirItem(item)) removed++;
		}
		return removed;
	}

	send(callback?: (err: Error | null, status?: 'sent' | 'pending') => void): void {
		if (this.id) {
			makeAnError(new Error('This offer has already been sent'), callback);
			return;
		}
		if (this.itemsToGive.length + this.itemsToReceive.length === 0) {
			makeAnError(new Error('Cannot send an empty trade offer'), callback);
			return;
		}

		const itemMapper = (item: Record<string, unknown>) => ({
			appid: item['appid'],
			contextid: item['contextid'],
			amount: item['amount'] ?? 1,
			assetid: item['assetid'],
		});

		const offerdata = {
			newversion: true,
			version: this.itemsToGive.length + this.itemsToReceive.length + 1,
			me: {
				assets: this.itemsToGive.map((i) => itemMapper(i as unknown as Record<string, unknown>)),
				currency: [],
				ready: false,
			},
			them: {
				assets: this.itemsToReceive.map((i) => itemMapper(i as unknown as Record<string, unknown>)),
				currency: [],
				ready: false,
			},
		};

		const params: Record<string, unknown> = {};
		if (this._token) params['trade_offer_access_token'] = this._token;

		this.manager._pendingOfferSendResponses++;

		this.manager._community.httpRequestPost(
			'https://steamcommunity.com/tradeoffer/new/send',
			{
				headers: {
					referer:
						`https://steamcommunity.com/tradeoffer/${this.id ?? 'new'}/?partner=${this.partner.accountid}` +
						(this._token ? '&token=' + this._token : ''),
				},
				json: true,
				form: {
					sessionid: this.manager._community.getSessionID(),
					serverid: 1,
					partner: this.partner.toString(),
					tradeoffermessage: this.message ?? '',
					json_tradeoffer: JSON.stringify(offerdata),
					captcha: '',
					trade_offer_create_params: JSON.stringify(params),
					tradeofferid_countered: this._countering,
				},
				checkJsonError: false,
				checkHttpError: false,
			},
			(err, response, body) => {
				const bObj = body as Record<string, unknown> | null;
				this.manager._pendingOfferSendResponses--;

				if (err) { makeAnError(err, callback); return; }

				if (response.statusCode !== 200) {
					if (response.statusCode === 401) {
						this.manager._community._notifySessionExpired(new Error('HTTP error 401'));
						makeAnError(new Error('Not Logged In'), callback);
						return;
					}
					makeAnError(new Error('HTTP error ' + response.statusCode), callback, bObj);
					return;
				}

				if (!bObj) { makeAnError(new Error('Malformed JSON response'), callback); return; }
				if (bObj['strError']) { makeAnError(null, callback, bObj); return; }

				if (bObj['tradeofferid']) {
					this.id = bObj['tradeofferid'] as string;
					this.state = ETradeOfferState.Active;
					this.created = new Date();
					this.updated = new Date();
					this.expires = new Date(Date.now() + 1209600000);

					// Migrate local _tempData into persistent pollData
					for (const k in this._tempData) {
						if (Object.prototype.hasOwnProperty.call(this._tempData, k)) {
							this.manager.pollData.offerData = this.manager.pollData.offerData ?? {};
							this.manager.pollData.offerData[this.id] = this.manager.pollData.offerData[this.id] ?? {};
							this.manager.pollData.offerData[this.id]![k] = this._tempData[k];
						}
					}
					delete (this as Record<string, unknown>)['_tempData'];
				}

				this.confirmationMethod = EConfirmationMethod.None;
				if (bObj['needs_email_confirmation']) {
					this.state = ETradeOfferState.CreatedNeedsConfirmation;
					this.confirmationMethod = EConfirmationMethod.Email;
				}
				if (bObj['needs_mobile_confirmation']) {
					this.state = ETradeOfferState.CreatedNeedsConfirmation;
					this.confirmationMethod = EConfirmationMethod.MobileApp;
				}

				this.manager.pollData.sent = this.manager.pollData.sent ?? {};
				this.manager.pollData.sent[this.id!] = this.state;
				this.manager.emit('pollData', this.manager.pollData);

				if (!callback) return;

				if (this.state === ETradeOfferState.CreatedNeedsConfirmation) {
					callback(null, 'pending');
				} else if (bObj['tradeofferid']) {
					callback(null, 'sent');
				} else {
					callback(new Error('Unknown response'));
				}
			},
			'tradeoffermanager',
		);
	}

	cancel(callback?: (err: Error | null) => void): void {
		if (!this.id) {
			makeAnError(new Error('Cannot cancel or decline an unsent offer'), callback);
			return;
		}
		if (
			this.state !== ETradeOfferState.Active &&
			this.state !== ETradeOfferState.CreatedNeedsConfirmation
		) {
			makeAnError(
				new Error(`Offer #${this.id} is not active, so it may not be cancelled or declined`),
				callback,
			);
			return;
		}

		this.manager._community.httpRequestPost(
			`https://steamcommunity.com/tradeoffer/${this.id}/${this.isOurOffer ? 'cancel' : 'decline'}`,
			{
				headers: {
					referer:
						`https://steamcommunity.com/tradeoffer/${this.id}/?partner=${this.partner.accountid}` +
						(this._token ? '&token=' + this._token : ''),
				},
				json: true,
				form: { sessionid: this.manager._community.getSessionID() },
				checkJsonError: false,
				checkHttpError: false,
			},
			(err, response, body) => {
				const bObj = body as Record<string, unknown> | null;
				if (err) { makeAnError(err, callback); return; }

				if (response.statusCode !== 200) {
					if (response.statusCode === 401) {
						this.manager._community._notifySessionExpired(new Error('HTTP error 401'));
						makeAnError(new Error('Not Logged In'), callback);
						return;
					}
					makeAnError(new Error('HTTP error ' + response.statusCode), callback, bObj);
					return;
				}

				if (!bObj) { makeAnError(new Error('Malformed JSON response'), callback); return; }
				if (bObj['strError']) { makeAnError(null, callback, bObj); return; }
				if (bObj['tradeofferid'] !== this.id) { makeAnError(new Error('Wrong response'), callback); return; }

				this.state = this.isOurOffer ? ETradeOfferState.Canceled : ETradeOfferState.Declined;
				this.updated = new Date();
				callback?.(null);
				this.manager.doPoll();
			},
			'tradeoffermanager',
		);
	}

	decline(callback?: (err: Error | null) => void): void {
		return this.cancel(callback);
	}

	accept(
		skipStateUpdate?: boolean | ((err: Error | null, status?: 'accepted' | 'pending' | 'escrow') => void),
		callback?: (err: Error | null, status?: 'accepted' | 'pending' | 'escrow') => void,
	): void {
		if (typeof skipStateUpdate === 'undefined') skipStateUpdate = false;
		if (typeof skipStateUpdate === 'function') {
			callback = skipStateUpdate;
			skipStateUpdate = false;
		}

		if (!this.id) { makeAnError(new Error('Cannot accept an unsent offer'), callback); return; }
		if (this.state !== ETradeOfferState.Active) {
			makeAnError(new Error(`Offer #${this.id} is not active, so it may not be accepted`), callback);
			return;
		}
		if (this.isOurOffer) {
			makeAnError(new Error(`Cannot accept our own offer #${this.id}`), callback);
			return;
		}

		this.manager._community.httpRequestPost(
			`https://steamcommunity.com/tradeoffer/${this.id}/accept`,
			{
				headers: { Referer: `https://steamcommunity.com/tradeoffer/${this.id}/` },
				json: true,
				form: {
					sessionid: this.manager._community.getSessionID(),
					serverid: 1,
					tradeofferid: this.id,
					partner: this.partner.toString(),
					captcha: '',
				},
				checkJsonError: false,
				checkHttpError: false,
			},
			(err, response, body) => {
				const bObj = body as Record<string, unknown> | null;
				if (err || response.statusCode !== 200) {
					if (response?.statusCode === 403) {
						this.manager._community._notifySessionExpired(new Error('HTTP error 403'));
						makeAnError(new Error('Not Logged In'), callback, bObj);
					} else {
						makeAnError(err ?? new Error('HTTP error ' + response.statusCode), callback, bObj);
					}
					return;
				}

				if (!bObj) { makeAnError(new Error('Malformed JSON response'), callback); return; }
				if (bObj['strError']) { makeAnError(null, callback, bObj); return; }

				this.manager.doPoll();
				if (!callback) return;

				if (skipStateUpdate) {
					if (bObj['tradeid']) this.tradeID = bObj['tradeid'] as string;
					if (bObj['needs_mobile_confirmation'] || bObj['needs_email_confirmation']) {
						callback(null, 'pending');
					} else {
						callback(null, 'accepted');
					}
					return;
				}

				this.update((err) => {
					if (err) { callback!(new Error('Cannot load new trade data: ' + err.message)); return; }

					if (this.confirmationMethod !== null && this.confirmationMethod !== EConfirmationMethod.None) {
						callback!(null, 'pending');
					} else if (this.state === ETradeOfferState.InEscrow) {
						callback!(null, 'escrow');
					} else if (this.state === ETradeOfferState.Accepted) {
						callback!(null, 'accepted');
					} else {
						callback!(new Error('Unknown state ' + this.state));
					}
				});
			},
			'tradeoffermanager',
		);
	}

	update(callback: (err: Error | null) => void): void {
		this.manager.getOffer(this.id!, (err, offer) => {
			if (err) { callback(err); return; }

			const properties = ['id', 'state', 'expires', 'created', 'updated', 'escrowEnds', 'confirmationMethod', 'tradeID'];
			for (const key in offer!) {
				if (
					Object.prototype.hasOwnProperty.call(offer, key) &&
					typeof (offer as unknown as Record<string, unknown>)[key] !== 'function' &&
					(properties.includes(key) || this.isGlitched())
				) {
					(this as unknown as Record<string, unknown>)[key] = (offer as unknown as Record<string, unknown>)[key];
				}
			}
			callback(null);
		});
	}

	getReceivedItems(
		getActionsOrCallback: boolean | ((err: Error | null, items?: EconItem[]) => void),
		callback?: (err: Error | null, items?: EconItem[]) => void,
	): void {
		if (typeof getActionsOrCallback === 'function') {
			callback = getActionsOrCallback;
			getActionsOrCallback = false;
		}
		const getActions = getActionsOrCallback as boolean;

		if (!this.id) { makeAnError(new Error('Cannot request received items on an unsent offer'), callback); return; }
		if (this.state !== ETradeOfferState.Accepted) {
			makeAnError(new Error(`Offer #${this.id} is not accepted, cannot request received items`), callback);
			return;
		}
		if (!this.tradeID) {
			makeAnError(new Error(`Offer #${this.id} is accepted, but does not have a trade ID`), callback);
			return;
		}

		this.manager._community.httpRequestGet(
			`https://steamcommunity.com/trade/${this.tradeID}/receipt/`,
			(err, response, body) => {
				if (err || response.statusCode !== 200) {
					makeAnError(err ?? new Error('HTTP error ' + response.statusCode), callback);
					return;
				}

				const bStr = body as string;
				const errorMatch = bStr.match(/<div id="error_msg">\s*([^<]+)\s*<\/div>/);
				if (errorMatch) {
					makeAnError(new Error(errorMatch[1]!.trim()), callback);
					return;
				}

				const script = bStr.match(/(var oItem;[\s\S]*)<\/script>/);
				if (!script) {
					if (bStr.length < 100 && bStr.match(/\{"success": ?false}/)) {
						makeAnError(new Error('Not Logged In'), callback);
						return;
					}
					makeAnError(new Error('Malformed response'), callback);
					return;
				}

				const items: Record<string, unknown>[] = [];
				vm.runInNewContext(script[1]!, {
					UserYou: null,
					BuildHover: (_str: string, item: Record<string, unknown>) => { items.push(item); },
					$: () => ({ show: () => undefined }),
				});

				if (items.length === 0 && this.itemsToReceive.length > 0) {
					makeAnError(new Error('Data temporarily unavailable; try again later'), callback);
					return;
				}

				if (!getActions) {
					callback?.(null, processItems(items));
				} else {
					this.manager._addDescriptions(items, (err, describedItems) => {
						if (err) {
							callback?.(null, processItems(items));
						} else {
							callback?.(null, describedItems);
						}
					});
				}
			},
			'tradeoffermanager',
		);
	}

	getExchangeDetails(
		getDetailsIfFailedOrCallback: boolean | ((err: Error | null, status?: number, tradeInitTime?: Date, receivedItems?: unknown[], sentItems?: unknown[]) => void),
		callback?: (err: Error | null, status?: number, tradeInitTime?: Date, receivedItems?: unknown[], sentItems?: unknown[]) => void,
	): void {
		if (typeof getDetailsIfFailedOrCallback === 'function') {
			callback = getDetailsIfFailedOrCallback;
			getDetailsIfFailedOrCallback = false;
		}
		const getDetailsIfFailed = getDetailsIfFailedOrCallback as boolean;

		if (!this.id) { makeAnError(new Error('Cannot get trade details for an unsent trade offer'), callback); return; }
		if (!this.tradeID) { makeAnError(new Error('No trade ID; unable to get trade details'), callback); return; }

		this.manager._apiCall('GET', { iface: 'ISteamEconomy', method: 'GetTradeStatus' }, 1, { tradeid: this.tradeID }, (err, result) => {
			if (err) { makeAnError(err, callback); return; }

			const res = result as Record<string, unknown>;
			if (!res['response'] || !(res['response'] as Record<string, unknown>)['trades']) {
				makeAnError(new Error('Malformed response'), callback);
				return;
			}

			const trades = ((res['response'] as Record<string, unknown>)['trades'] as Record<string, unknown>[]);
			const trade = trades[0];
			if (!trade || trade['tradeid'] !== this.tradeID) {
				makeAnError(new Error('Trade not found in GetTradeStatus response; try again later'), callback);
				return;
			}

			const status = trade['status'] as number;
			if (
				!getDetailsIfFailed &&
				![ETradeStatus.Complete, ETradeStatus.InEscrow, ETradeStatus.EscrowRollback].includes(status)
			) {
				makeAnError(new Error('Trade status is ' + (ETradeStatus[status] ?? status)), callback);
				return;
			}

			if (!this.manager._language) {
				callback?.(null, status, new Date((trade['time_init'] as number) * 1000), trade['assets_received'] as unknown[] ?? [], trade['assets_given'] as unknown[] ?? []);
			} else {
				const allAssets = [...(trade['assets_received'] as unknown[] ?? []), ...(trade['assets_given'] as unknown[] ?? [])];
				this.manager._requestDescriptions(allAssets as Array<{ appid: number; classid: string; instanceid?: string }>, (descErr) => {
					if (descErr) { callback?.(descErr); return; }

					const received = this.manager._mapItemsToDescriptions(null, null, trade['assets_received'] as Record<string, unknown>[] ?? []);
					const given = this.manager._mapItemsToDescriptions(null, null, trade['assets_given'] as Record<string, unknown>[] ?? []);
					callback?.(null, status, new Date((trade['time_init'] as number) * 1000), received, given);
				});
			}
		});
	}

	getUserDetails(
		callback: (err: Error | null, me?: TradeUserDetails, them?: TradeUserDetails) => void,
	): void {
		if (this.id && this.isOurOffer) {
			makeAnError(new Error('Cannot get user details for an offer that we sent.'), callback);
			return;
		}
		if (this.id && this.state !== ETradeOfferState.Active) {
			makeAnError(new Error('Cannot get user details for an offer that is sent and not Active.'), callback);
			return;
		}

		let url: string;
		if (this.id) {
			url = `https://steamcommunity.com/tradeoffer/${this.id}/`;
		} else {
			url = `https://steamcommunity.com/tradeoffer/new/?partner=${this.partner.accountid}`;
			if (this._token) url += '&token=' + this._token;
		}

		this.manager._community.httpRequestGet(url, (err, response, body) => {
			if (err || response.statusCode !== 200) {
				makeAnError(err ?? new Error('HTTP error ' + response.statusCode), callback);
				return;
			}

			const bStr = body as string;
			const scriptMatch = bStr.match(
				/\n\W*<script type="text\/javascript">\W*\r?\n?(\W*var g_rgAppContextData[\s\S]*)<\/script>/,
			);
			if (!scriptMatch) {
				makeAnError(new Error('Malformed response'), callback);
				return;
			}

			let script = scriptMatch[1]!;
			const closePos = script.indexOf('</script>');
			if (closePos !== -1) script = script.substring(0, closePos);

			const vmContext = vm.createContext({
				UserYou:  { SetProfileURL: () => undefined, SetSteamId: () => undefined },
				UserThem: { SetProfileURL: () => undefined, SetSteamId: () => undefined },
				$J: () => undefined,
			});
			vm.runInContext(script, vmContext);

			const ctx = vmContext as Record<string, unknown>;
			const me: TradeUserDetails = {
				personaName: ctx['g_strYourPersonaName'] as string,
				contexts: ctx['g_rgAppContextData'],
			};
			const them: TradeUserDetails = {
				personaName: ctx['g_strTradePartnerPersonaName'] as string,
				contexts: ctx['g_rgPartnerAppContextData'],
				probation: ctx['g_bTradePartnerProbation'] as boolean,
			};

			const myEscrow   = bStr.match(/var g_daysMyEscrow = (\d+);/);
			const theirEscrow = bStr.match(/var g_daysTheirEscrow = (\d+);/);
			if (myEscrow && theirEscrow) {
				me.escrowDays   = parseInt(myEscrow[1]!, 10);
				them.escrowDays = parseInt(theirEscrow[1]!, 10);
			}

			const myAvatar   = bStr.match(new RegExp('<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' + this.manager.steamID!.accountid + '">'));
			const theirAvatar = bStr.match(new RegExp('<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' + this.partner.accountid + '">'));

			if (myAvatar) {
				me.avatarIcon   = myAvatar[1];
				me.avatarMedium = myAvatar[1]!.replace('.jpg', '_medium.jpg');
				me.avatarFull   = myAvatar[1]!.replace('.jpg', '_full.jpg');
			}
			if (theirAvatar) {
				them.avatarIcon   = theirAvatar[1];
				them.avatarMedium = theirAvatar[1]!.replace('.jpg', '_medium.jpg');
				them.avatarFull   = theirAvatar[1]!.replace('.jpg', '_full.jpg');
			}

			callback(null, me, them);
		});
	}

	counter(): TradeOffer {
		if (this.state !== ETradeOfferState.Active) {
			throw new Error('Cannot counter a non-active offer.');
		}
		const offer = this.duplicate();
		offer._countering = this.id;
		return offer;
	}

	duplicate(): TradeOffer {
		const offer = new TradeOffer(this.manager, this.partner, this._token);
		offer.itemsToGive = this.itemsToGive.slice();
		offer.itemsToReceive = this.itemsToReceive.slice();
		offer.isOurOffer = true;
		offer.fromRealTimeTrade = false;
		return offer;
	}

	setMessage(message: string): void {
		if (this.id) throw new Error('Cannot set message in an already-sent offer');
		this.message = message.toString().substring(0, 128);
	}

	setToken(token: string): void {
		if (this.id) throw new Error('Cannot set token in an already-sent offer');
		this._token = token;
	}
}

// ── Module-level helper (not on prototype) ───────────────────────────────────

function addItem(details: TradeItemInput, offer: TradeOffer, list: EconItem[]): boolean {
	if (offer.id) throw new Error('Cannot add items to an already-sent offer');

	if (
		details.appid === undefined ||
		details.contextid === undefined ||
		(details.assetid === undefined && details.id === undefined)
	) {
		throw new Error('Missing appid, contextid, or assetid parameter');
	}

	const item: TradeItemNormalized = {
		id:        ((details.id ?? details.assetid) as string | number).toString(),
		assetid:   ((details.assetid ?? details.id) as string | number).toString(),
		appid:     parseInt(details.appid as string, 10),
		contextid: (details.contextid as string | number).toString(),
		amount:    parseInt((details.amount ?? 1) as string, 10),
	};

	if (item.assetid === '0' || item.contextid === '0') {
		throw new Error('Invalid assetid or contextid');
	}

	if (list.some((tradeItem) => itemEquals(tradeItem as unknown as import('../types').RawTradeItem, item as unknown as import('../types').RawTradeItem))) {
		return false;
	}

	list.push(item as unknown as EconItem);
	return true;
}
