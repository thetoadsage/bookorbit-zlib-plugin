import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const type = 'zlib';
const runtimePath = resolve(root, 'indexers', type, 'index.mjs');
const source = await readFile(runtimePath);
const plugin = (await import(`../indexers/${type}/index.mjs`)).default;
assert.equal(plugin.apiVersion, 1);
assert.equal(plugin.type, type);
assert.match(plugin.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

if (process.argv.includes('--preflight')) {
  console.log(`Packaging preflight passed: ${type} ${plugin.version}; runtime file exists`);
  process.exit(0);
}

const manifest = JSON.parse(await readFile(resolve(root, 'updates', `${type}.json`), 'utf8'));
assert.deepEqual(Object.keys(manifest), ['schemaVersion', 'type', 'version', 'sourceUrl', 'sha256', 'signature']);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.type, type);
assert.equal(manifest.version, plugin.version);
assert.match(manifest.sourceUrl, /^https:\/\//);
assert.equal(plugin.update?.manifestUrl, manifest.sourceUrl.replace(`/indexers/${type}/index.mjs`, `/updates/${type}.json`));
assert.match(plugin.update?.ed25519PublicKey ?? '', /^[A-Za-z0-9_-]{43}$/);
assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'));
assert.match(manifest.signature, /^[A-Za-z0-9+/]{86}==$/);
const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: plugin.update.ed25519PublicKey }, format: 'jwk' });
assert.equal(verify(null, source, key, Buffer.from(manifest.signature, 'base64')), true);
console.log(`Signed update verified: ${type} ${plugin.version}`);
