import {entries, fromPairs, isString, startsWith} from 'lodash';
import {sha256hmac} from './crypto';
import {AUTHORIZATION, HOST, CONTENT_MD5, CONTENT_LENGTH, CONTENT_TYPE} from './headers';
import {uriEncode} from './strings';

const defaultHeadersToSign = [HOST, CONTENT_MD5, CONTENT_LENGTH, CONTENT_TYPE];

// migrate from https://github.com/baidubce/bce-sdk-js/blob/master/src/auth.js

export default class Auth {
    constructor(ak, sk) {
        this.ak = ak;
        this.sk = sk;
    }

    generateAuthorization(method, resource, params,
        headers, now = new Date(), expirationInSeconds = 1800, headersToSign) {

        let rawSessionKey = [
            'bce-auth-v1',
            this.ak,
            now.toISOString().replace(/\.\d+Z$/, 'Z'),
            expirationInSeconds
        ].join('/');
        let sessionKey = sha256hmac(this.sk, rawSessionKey);

        let canonicalUri = this.uriCanonicalization(resource);
        let canonicalQueryString = this.queryStringCanonicalization(params || {});

        let [canonicalHeaders, signedHeaders] = this.headersCanonicalization(headers || {}, headersToSign);

        let rawSignature = [method, canonicalUri, canonicalQueryString, canonicalHeaders].join('\n');
        let signature = sha256hmac(sessionKey, rawSignature);

        return [rawSessionKey, signedHeaders.join(';'), signature].join('/');
    }

    uriCanonicalization(uri) {
        return uri;
    }

    queryStringCanonicalization(params) {
        let canonicalQueryString = Object.keys(params).reduce(function (ret, key) {
            if (key.toLowerCase() === AUTHORIZATION.toLowerCase()) {
                return ret;
            }

            let value = params[key] == null ? '' : params[key];
            return ret.concat(key + '=' + uriEncode(value));
        }, []);

        return canonicalQueryString.sort().join('&');
    }

    headersCanonicalization(headers, headersToSign = defaultHeadersToSign) {
        const headersMap = fromPairs(headersToSign.map(h => [h.toLowerCase(), true]));
        let canonicalHeaders = entries(headers).reduce(function (ret, [key, value]) {
            key = key.toLowerCase();
            value = isString(value) ? value.trim() : value;
            if (value !== null && value !== ''
                && (startsWith(key, 'x-bce-') || headersMap[key] === true)) {
                return ret.concat([key, value].map(uriEncode).join(':'));
            }
            return ret;
        }, []);

        canonicalHeaders.sort();

        let signedHeaders = canonicalHeaders.map(h => h.split(':')[0]);
        return [canonicalHeaders.join('\n'), signedHeaders];
    }

}
