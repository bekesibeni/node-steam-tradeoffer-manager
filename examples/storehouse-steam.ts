/**
 * STOREHOUSE - node-steam
 *
 * Uses node-steam-user for notifications and accepts all incoming trade offers,
 *    node-steamcommunity for confirming trades,
 *    node-steam-totp to generate 2FA codes
 */

import SteamUser = require('steam-user');
import SteamCommunity from 'steamcommunity';
import * as SteamTotp from 'steam-totp';
import * as FS from 'fs';
import { TradeOfferManager } from '../src/index';

const client    = new SteamUser();
const manager   = new TradeOfferManager({
	steam:  client,
	domain: 'example.com',
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
	});
	community.setCookies(cookies);
});

manager.on('newOffer', (offer) => {
	console.log('New offer #' + offer.id + ' from ' + offer.partner.getSteam3RenderedID());
	offer.accept((err, status) => {
		if (err) {
			console.log('Unable to accept offer: ' + err.message);
		} else {
			console.log('Offer accepted: ' + status);
			if (status === 'pending') {
				community.acceptConfirmationForObject('identitySecret', offer.id!, (err: Error | null) => {
					if (err) {
						console.log("Can't confirm trade offer: " + err.message);
					} else {
						console.log('Trade offer ' + offer.id + ' confirmed');
					}
				});
			}
		}
	});
});

manager.on('receivedOfferChanged', (offer, oldState) => {
	console.log(`Offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);

	if (offer.state === TradeOfferManager.ETradeOfferState.Accepted) {
		offer.getExchangeDetails((err, status, _tradeInitTime, receivedItems, sentItems) => {
			if (err) {
				console.log(`Error ${err}`);
				return;
			}
			const newReceivedItems = (receivedItems as Array<{ new_assetid?: string }>).map((item) => item.new_assetid);
			const newSentItems     = (sentItems     as Array<{ new_assetid?: string }>).map((item) => item.new_assetid);
			console.log(`Received items ${newReceivedItems.join(',')} Sent Items ${newSentItems.join(',')} - status ${TradeOfferManager.ETradeStatus[status!]}`);
		});
	}
});

manager.on('pollData', (pollData) => {
	FS.writeFileSync('polldata.json', JSON.stringify(pollData));
});
