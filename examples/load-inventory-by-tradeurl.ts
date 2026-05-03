/**
 * LOAD INVENTORY BY TRADE URL
 *
 * Logs into a Steam account, then loads the partner's CS2 inventory
 * (appid 730, contextid 2) via the legacy /tradeoffer/new/partnerinventory/
 * endpoint, which respects the trade-URL token.
 *
 * Usage:
 *   tsx examples/load-inventory-by-tradeurl.ts "<tradeUrl>"
 *
 * Credentials are read from env vars; missing ones are prompted interactively:
 *   STEAM_USERNAME       account name
 *   STEAM_PASSWORD       account password
 *   STEAM_SHARED_SECRET  optional — auto-generates the 2FA code via steam-totp
 *   STEAM_2FA            current Steam Guard mobile code (used if no shared secret)
 */

import SteamCommunity from 'steamcommunity';
import * as SteamTotp from 'steam-totp';
import * as readline from 'node:readline';
import { TradeOfferManager } from '../src/index';

const TRADE_URL = process.argv[2] ?? 'https://steamcommunity.com/tradeoffer/new/?partner=000000000&token=XXXXXXXX';

const APPID = 730;
const CONTEXTID = 2;

function prompt(question: string, hidden = false): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		if (hidden) {
			const stdout = process.stdout as NodeJS.WriteStream;
			const original = stdout.write.bind(stdout);
			process.stdout.write(question);
			stdout.write = ((chunk: string | Uint8Array) => {
				if (typeof chunk === 'string' && chunk !== '\r\n' && chunk !== '\n') return true;
				return original(chunk);
			}) as typeof stdout.write;
			rl.question('', (answer) => {
				stdout.write = original;
				process.stdout.write('\n');
				rl.close();
				resolve(answer);
			});
		} else {
			rl.question(question, (answer) => {
				rl.close();
				resolve(answer);
			});
		}
	});
}

async function getCredentials() {
	const accountName = process.argv[3];
	const password = process.argv[4];

	let twoFactorCode: string;
	if (process.argv[5]) {
		twoFactorCode = SteamTotp.getAuthCode(process.argv[5]);
	} else if (process.env.STEAM_2FA) {
		twoFactorCode = process.env.STEAM_2FA;
	} else {
		twoFactorCode = await prompt('Steam Guard mobile code: ');
	}

	return { accountName, password, twoFactorCode };
}

async function main() {
	const community = new SteamCommunity();
	const manager = new TradeOfferManager({
		community,
		domain: 'localhost',
		language: 'en',
		pollInterval: -1,
	});

	const credentials = await getCredentials();
	console.log(`Logging in as ${credentials.accountName}…`);

	const cookies = await new Promise<string[]>((resolve, reject) => {
		community.login(credentials, (err, _sessionID, cookies) => {
			if (err) reject(err);
			else resolve(cookies ?? []);
		});
	});

	await new Promise<void>((resolve, reject) => {
		manager.setCookies(cookies, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});

	console.log('Logged in & cookies set.');

	const offer = manager.createOffer(TRADE_URL);
	console.log(`Loading partner inventory via /tradeoffer/new/partnerinventory/ (partner=${offer.partner.getSteamID64()}, appid=${APPID}, contextid=${CONTEXTID})…`);

	offer.getPartnerInventoryContents(APPID, CONTEXTID, (err, items, _currency, totalCount) => {
		if (err) {
			console.error('Failed to load inventory:', err.message);
			process.exit(1);
		}

		const list = items ?? [];
		console.log(`\nLoaded ${list.length} items (totalCount: ${totalCount ?? list.length})\n`);

		for (const item of list.slice(0, 20)) {
			console.log(`  [${item.assetid}] ${item.market_hash_name ?? item.name ?? '(no name)'}`);
		}
		console.log(list[0])
		if (list.length > 20) {
			console.log(`  … and ${list.length - 20} more`);
		}

		process.exit(0);
	});
}

main().catch((err) => {
	console.error('Fatal:', err.message);
	process.exit(1);
});
