"use strict";

import { TradeOfferManager } from '../TradeOfferManager';
import { EResult } from '../resources/EResult';
import type { ApiCallMethod } from '../types';

declare module '../TradeOfferManager' {
	interface TradeOfferManager {
		_apiCall(
			httpMethod: 'GET' | 'POST',
			method: string | ApiCallMethod,
			version: number,
			input: Record<string, unknown>,
			callback: (err: Error | null, body: Record<string, unknown>) => void,
		): void;
	}
}

TradeOfferManager.prototype._apiCall = function (
	this: TradeOfferManager,
	httpMethod: 'GET' | 'POST',
	method: string | ApiCallMethod,
	version: number,
	input: Record<string, unknown>,
	callback: (err: Error | null, body: Record<string, unknown>) => void,
): void {
	if (!this.apiKey && !this.accessToken) {
		callback(new Error('API key or access token is not set yet. Call setCookies() first.'), {} as Record<string, unknown>);
		return;
	}

	let iface = 'IEconService';
	if (typeof method === 'object') {
		iface = method.iface;
		method = method.method;
	}

	const options: Record<string, unknown> = {
		uri:    `https://api.steampowered.com/${iface}/${method}/v${version}/`,
		json:   true,
		method: httpMethod,
		gzip:   true,
	};

	const inp: Record<string, unknown> = input ?? {};
	if (this.apiKey && !this.useAccessToken) {
		inp['key'] = this.apiKey;
	} else {
		inp['access_token'] = this.accessToken;
	}
	options[httpMethod === 'GET' ? 'qs' : 'form'] = inp;

	this._community.httpRequest(options, (err, response, body) => {
		let error: Error | null = err;

		if (response && response.statusCode !== 200 && !error) {
			error = new Error('HTTP error ' + response.statusCode);
		}

		if (error) {
			(error as Error & { body?: unknown }).body = body;
			if (
				response &&
				typeof response.body === 'string' &&
				response.body.indexOf('Access is denied') >= 0
			) {
				this._notifySessionExpired(error);
			}
			callback(error, {} as Record<string, unknown>);
			return;
		}

		let eresult = response.headers['x-eresult'] as string | undefined;
		let eresultNum = eresult ? parseInt(eresult, 10) : undefined;

		// Steam occasionally sends fake Fail (2) responses
		if (
			eresultNum === 2 &&
			body &&
			typeof body === 'object' &&
			(Object.keys(body as object).length > 1 ||
				((body as Record<string, unknown>)['response'] &&
					Object.keys((body as Record<string, unknown>)['response'] as object).length > 0))
		) {
			eresultNum = 1;
		}

		if (eresultNum !== undefined && eresultNum !== 1) {
			error = new Error(EResult[eresultNum] ?? String(eresultNum));
			(error as Error & { eresult?: number; body?: unknown }).eresult = eresultNum;
			(error as Error & { body?: unknown }).body = body;
			callback(error, {} as Record<string, unknown>);
			return;
		}

		if (!body || typeof body !== 'object') {
			error = new Error('Invalid API response');
			(error as Error & { body?: unknown }).body = body;
			callback(error, {} as Record<string, unknown>);
			return;
		}

		callback(null, body as Record<string, unknown>);
	}, 'tradeoffermanager');
};
