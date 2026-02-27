"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TradeOfferManager_1 = require("../TradeOfferManager");
const EResult_1 = require("../resources/EResult");
TradeOfferManager_1.TradeOfferManager.prototype._apiCall = function (httpMethod, method, version, input, callback) {
    if (!this.apiKey && !this.accessToken) {
        callback(new Error('API key or access token is not set yet. Call setCookies() first.'), {});
        return;
    }
    let iface = 'IEconService';
    if (typeof method === 'object') {
        iface = method.iface;
        method = method.method;
    }
    const options = {
        uri: `https://api.steampowered.com/${iface}/${method}/v${version}/`,
        json: true,
        method: httpMethod,
        gzip: true,
    };
    const inp = input ?? {};
    if (this.apiKey && !this.useAccessToken) {
        inp['key'] = this.apiKey;
    }
    else {
        inp['access_token'] = this.accessToken;
    }
    options[httpMethod === 'GET' ? 'qs' : 'form'] = inp;
    this._community.httpRequest(options, (err, response, body) => {
        let error = err;
        if (response && response.statusCode !== 200 && !error) {
            error = new Error('HTTP error ' + response.statusCode);
        }
        if (error) {
            error.body = body;
            if (response &&
                typeof response.body === 'string' &&
                response.body.indexOf('Access is denied') >= 0) {
                this._notifySessionExpired(error);
            }
            callback(error, {});
            return;
        }
        let eresult = response.headers['x-eresult'];
        let eresultNum = eresult ? parseInt(eresult, 10) : undefined;
        // Steam occasionally sends fake Fail (2) responses
        if (eresultNum === 2 &&
            body &&
            typeof body === 'object' &&
            (Object.keys(body).length > 1 ||
                (body['response'] &&
                    Object.keys(body['response']).length > 0))) {
            eresultNum = 1;
        }
        if (eresultNum !== undefined && eresultNum !== 1) {
            error = new Error(EResult_1.EResult[eresultNum] ?? String(eresultNum));
            error.eresult = eresultNum;
            error.body = body;
            callback(error, {});
            return;
        }
        if (!body || typeof body !== 'object') {
            error = new Error('Invalid API response');
            error.body = body;
            callback(error, {});
            return;
        }
        callback(null, body);
    }, 'tradeoffermanager');
};
//# sourceMappingURL=webapi.js.map