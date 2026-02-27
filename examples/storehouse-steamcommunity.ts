/**
 * STOREHOUSE - node-steamcommunity
 *
 * Uses node-steamcommunity to login to Steam, accept and confirm all incoming trade offers,
 *    node-steam-totp to generate 2FA codes
 */

import SteamCommunity from 'steamcommunity';
import * as SteamTotp from 'steam-totp';
import * as FS from 'fs';
import { TradeOfferManager } from '../src/index';

const community = new SteamCommunity();
const manager   = new TradeOfferManager({
	domain:       'example.com',
	language:     'en',
	pollInterval: 5000,
});

interface LogOnOptions {
	accountName: string;
	password: string;
	twoFactorCode: string;
	steamguard?: string;
}

const logOnOptions: LogOnOptions = {
	accountName:    'username',
	password:       'password',
	twoFactorCode:  SteamTotp.getAuthCode('sharedSecret'),
};

if (FS.existsSync('steamguard.txt')) {
	logOnOptions.steamguard = FS.readFileSync('steamguard.txt').toString('utf8');
}

if (FS.existsSync('polldata.json')) {
	manager.pollData = JSON.parse(FS.readFileSync('polldata.json').toString('utf8'));
}

community.login(logOnOptions, (err: Error | null, _sessionID: string, cookies: string[], steamguard: string) => {
	if (err) {
		console.log('Steam login fail: ' + err.message);
		process.exit(1);
	}

	FS.writeFileSync('steamguard.txt', steamguard);
	console.log('Logged into Steam');

	manager.setCookies(cookies, (err) => {
		if (err) {
			console.log(err);
			process.exit(1);
			return;
		}
		console.log('Cookies set');
	});
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
