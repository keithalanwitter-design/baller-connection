// Prints a fresh VAPID key pair for Web Push (run it yourself; never commit the output).
// Same format as `npx web-push generate-vapid-keys`: base64url uncompressed P-256 public key + base64url 32-byte private key.
const b64u = (b) => Buffer.from(b).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)); const { d } = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log(`VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${d}\n\n# wrangler secret put VAPID_PRIVATE_KEY   (paste the private key)\n# wrangler.toml [vars] VAPID_PUBLIC_KEY = "${pub}", VAPID_SUBJECT = "mailto:you@yourdomain"`);
