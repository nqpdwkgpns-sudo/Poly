import { keccak256, toUtf8Bytes } from 'ethers';
import { clobClient } from '../market/clobClient.js';
import { PhantomAdapter } from './phantomAdapter.js';
import { buildClobL1Auth } from './orderSigner.js';

/**
 * Wires the CLOB client's auth-header provider to the wallet. Polymarket's
 * production deployment expects both L1 (api-key signature) and L2 (HMAC over
 * passphrase) auth; in absence of an API key we fall back to L1-only headers,
 * which is sufficient for read endpoints + signed-order submission.
 */
export function attachClobAuth(adapter: PhantomAdapter, apiKey?: string, secret?: string, passphrase?: string): void {
  clobClient.setAuthProvider(async ({ method, path, bodyHash, ts }) => {
    const { signature, address } = await buildClobL1Auth(adapter, ts);
    const headers: Record<string, string> = {
      POLY_ADDRESS: address,
      POLY_TIMESTAMP: String(ts),
      POLY_SIGNATURE: signature,
      POLY_NONCE: '0',
    };
    if (apiKey && secret && passphrase) {
      const payload = `${ts}${method.toUpperCase()}${path}${bodyHash ?? ''}`;
      const hmac = keccak256(toUtf8Bytes(secret + payload));
      headers.POLY_API_KEY = apiKey;
      headers.POLY_PASSPHRASE = passphrase;
      headers.POLY_API_SIG = hmac;
    }
    return headers;
  });
}
