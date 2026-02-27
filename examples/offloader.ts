/**
 * OFFLOADER
 *
 * Once logged in, sends a trade offer containing this account's entire tradable CS2 inventory.
 */

import SteamUser = require('steam-user');
import SteamCommunity from 'steamcommunity';
import * as SteamTotp from 'steam-totp';
import * as FS from 'fs';
import { TradeOfferManager, EconItem } from '../src/index';

const PARTNER_STEAM_ID = '76561198XXXXXXXXX'; // target SteamID64

const client    = new SteamUser();
const manager   = new TradeOfferManager({
	steam:    client,
	domain:   'example.com',
	language: 'en',
});
const community = new SteamCommunity();

const logOnOptions = {
	accountName:   'username',
	password:      'password',
	twoFactorCode: SteamTotp.getAuthCode('sharedSecret'),
};

if (FS.existsSync('polldata.json')) {
	manager.pollData = JSON.parse(FS.readFileSync('polldata.json').toString('utf8'));
}

client.logOn(logOnOptions);

client.on('loggedOn', () => {
	console.log('Logged into Steam');
});

client.on('webSession', (_sessionID: string, cookies: string[]) => {
	manager.setCookies(cookies, (err) => {
		if (err) {
			console.log(err);
			process.exit(1);
			return;
		}

		console.log('Cookies set');

		// Get our CS2 inventory (appid 730, context 2)
		manager.getInventoryContents(730, 2, true, (err, inventory) => {
			if (err) {
				console.log(err);
				return;
			}

			if (!inventory || inventory.length === 0) {
				console.log('CS2 inventory is empty');
				return;
			}

			console.log(`Found ${inventory.length} tradable items`);

			const offer = manager.createOffer(PARTNER_STEAM_ID);
			offer.addMyItems(inventory as EconItem[]);
			offer.setMessage('Have fun!');

			offer.send((err, status) => {
				if (err) {
					console.log('Error sending offer: ' + err.message);
					return;
				}
				console.log('Sent offer, status: ' + status);
				if (status === 'pending') {
					community.acceptConfirmationForObject('identitySecret', offer.id!, (err: Error | null) => {
						if (err) console.log("Can't confirm trade offer: " + err.message);
						else console.log('Trade offer ' + offer.id + ' confirmed');
					});
				}
			});
		});
	});
	community.setCookies(cookies);
});

manager.on('pollData', (pollData) => {
	FS.writeFileSync('polldata.json', JSON.stringify(pollData));
});
