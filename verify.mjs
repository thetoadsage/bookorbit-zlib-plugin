import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import plugin from './index.mjs';
import { summarize } from './live-validate.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const host = {
  buildSearchText: (query) => [query.title, query.author].filter(Boolean).join(' '),
  logger: { log() {}, warn() {} },
  fail: (failure, message) => Object.assign(new Error(message), { failure }),
  fetch: () => { throw new Error('offline plugin must not fetch'); },
};
const config = { id: 1, settings: { provider: 'mock' } };

assert.equal(plugin.apiVersion, 1);
assert.equal(plugin.type, 'zlib');
assert.match(plugin.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
assert.equal(plugin.label, 'Z-Library');
assert.equal(plugin.defaultBaseUrl, 'https://z-lib.gd');
assert.equal(plugin.settingsFields.find((field) => field.key === 'provider').default, 'eapi');
assert.equal(plugin.requiresCredential, true);
assert.deepEqual(plugin.mediaKinds, ['ebook']);
assert.equal(plugin.supportsIsbnSearch, true);
assert.deepEqual(plugin.settingsFields.find((field) => field.key === 'ebookFormats').options, ['epub', 'azw3', 'mobi', 'pdf']);

for (const name of ['search-isbn.json', 'search-title.json', 'empty.json']) {
  const { query, expectedGuids } = fixture(name);
  const results = await plugin.search(query, config, host);
  assert.deepEqual(results.map((result) => result.guid), expectedGuids, name);
  for (const result of results) {
    assert.equal(result.title, 'Pride and Prejudice');
    assert.equal(result.author, 'Jane Austen');
    assert.equal(result.isbn, '9780141439518');
    assert.equal(result.format, 'epub');
    assert.equal(result.seeders, null);
    assert.equal(result.leechers, null);
    assert.equal(result.primaryFileCount, 1);
  }
}

assert.equal((await plugin.test(config, host)).success, true);
const [release] = await plugin.search(fixture('search-title.json').query, config, host);
const file = await plugin.resolveFile(release, config, host);
assert.deepEqual(file, {
  url: 'https://www.gutenberg.org/ebooks/1342.epub3.images',
  fileName: 'Pride and Prejudice.epub', sizeBytes: null, format: 'epub',
});
await assert.rejects(plugin.resolveFile({ ...release, guid: 'unknown' }, config, host), { failure: 'error' });
assert.deepEqual(await plugin.search(fixture('search-title.json').query,
  { id: 1, settings: { provider: 'mock', ebookFormats: 'pdf' } }, host), []);

let nextId = 100;
function eapiCase(searchReplies, loginReply = fixture('eapi-login.json'), loginHeaders = {}, loginStatus = 200) {
  const calls = [];
  const logs = [];
  const config = {
    id: nextId++, baseUrl: 'https://example.invalid', credential: 'fixture-password',
    settings: { provider: 'eapi', email: 'fixture@example.invalid', ebookFormats: 'epub,azw3,mobi,pdf', languages: 'english' },
  };
  const testHost = {
    ...host,
    logger: { log: (message) => logs.push(message), warn: (message) => logs.push(message) },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      const login = url.endsWith('/user/login');
      const next = login ? loginReply : searchReplies.shift();
      const reply = next && Object.hasOwn(next, 'body') && Object.hasOwn(next, 'status') ? next : { body: next, status: 200 };
      return Response.json(reply.body,
        { status: login ? loginStatus : reply.status, headers: login ? loginHeaders : {} });
    },
  };
  return { calls, logs, config, testHost };
}
const titleQuery = fixture('search-title.json').query;
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
{
  const setup = eapiCase(Array.from({ length: 5 }, () => fixture('eapi-empty.json')));
  await Promise.all([
    ...Array.from({ length: 5 }, () => plugin.search(titleQuery, setup.config, setup.testHost)),
    plugin.test(setup.config, setup.testHost),
  ]);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 1,
    'concurrent cold searches and Test share one pending login');
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/book/search')).length, 5);
  await plugin.test(setup.config, setup.testHost);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2,
    'Test still refreshes a completed cached session');
}
{
  const loginReply = { success: 0, error: 'authentication failed' };
  const setup = eapiCase([fixture('eapi-empty.json')], loginReply);
  const results = await Promise.allSettled(Array.from({ length: 5 },
    () => plugin.search(titleQuery, setup.config, setup.testHost)));
  assert.equal(results.every((result) => result.status === 'rejected' && result.reason.failure === 'unauthorized'), true);
  assert.equal(setup.calls.length, 1, 'concurrent callers share a rejected login');
  Object.assign(loginReply, fixture('eapi-login.json'));
  await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2,
    'failed pending login is evicted so a later attempt can succeed');
}
for (const oldFails of [false, true]) {
  const setup = eapiCase([]);
  const oldLogin = deferred();
  const oldStarted = deferred();
  let logins = 0;
  const usedSessions = [];
  setup.testHost.fetch = async (url, init) => {
    if (url.endsWith('/user/login')) {
      logins++;
      if (new URLSearchParams(init.body).get('password') === 'fixture-password') {
        oldStarted.resolve();
        return oldLogin.promise;
      }
      return Response.json({ success: 1, user: { id: 42, remix_userkey: 'new-fixture-session' } });
    }
    usedSessions.push(init.headers['remix-userkey']);
    return Response.json(fixture('eapi-empty.json'));
  };
  const oldSearch = plugin.search(titleQuery, structuredClone(setup.config), setup.testHost);
  const oldResult = Promise.allSettled([oldSearch]);
  await oldStarted.promise;
  setup.config.credential = 'replacement-fixture-password';
  await plugin.search(titleQuery, setup.config, setup.testHost);
  oldLogin.resolve(Response.json(oldFails ? fixture('eapi-auth-failure.json') : fixture('eapi-login.json')));
  assert.equal((await oldResult)[0].status, oldFails ? 'rejected' : 'fulfilled');
  await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(logins, 2, 'old in-flight credentials cannot overwrite or evict the newer session');
  assert.equal(usedSessions.at(-1), 'new-fixture-session');
}
{
  const setup = eapiCase([fixture('eapi-empty.json')]);
  await plugin.search(titleQuery, setup.config, setup.testHost);
  const originalFetch = setup.testHost.fetch;
  const lateExpiry = deferred();
  let searches = 0;
  setup.testHost.fetch = (url, init) => {
    if (url.endsWith('/user/login')) return originalFetch(url, init);
    searches++;
    if (searches === 1) return Promise.resolve(Response.json({ success: 0 }, { status: 401 }));
    if (searches === 2) return lateExpiry.promise;
    return Promise.resolve(Response.json(fixture('eapi-empty.json')));
  };
  const first = plugin.search(titleQuery, setup.config, setup.testHost);
  const second = plugin.search(titleQuery, setup.config, setup.testHost);
  await first;
  lateExpiry.resolve(Response.json({ success: 0 }, { status: 401 }));
  await second;
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2,
    'late expiry of the old session reuses the refreshed session without another login');
  assert.equal(searches, 4, 'each expired search retries once');
}
{
  const setup = eapiCase([fixture('eapi-empty.json')]);
  delete setup.config.settings.provider;
  assert.deepEqual(await plugin.search(titleQuery, setup.config, setup.testHost), [],
    'omitted provider selects EAPI');
  assert.equal(setup.calls[0].url, 'https://example.invalid/eapi/user/login');
}
{
  const setup = eapiCase([fixture('eapi-isbn.json')]);
  const results = await plugin.search({ ...titleQuery, isbn13: '9780141439518' }, setup.config, setup.testHost);
  assert.equal(results.length, 1, 'ISBN result');
  assert.deepEqual(results[0], {
    guid: '101:AbC123', title: 'Pride and Prejudice', bookTitle: 'Pride and Prejudice',
    format: 'epub', sizeBytes: 1500000, seeders: null, leechers: null,
    primaryFileCount: 1, author: 'Jane Austen', isbn: '9780141439518', language: 'en',
  });
  assert.equal(setup.calls.length, 2, 'one login and one ISBN search');
  assert.equal(setup.calls[0].url, 'https://example.invalid/eapi/user/login');
  assert.equal(setup.calls[1].url, 'https://example.invalid/eapi/book/search');
  assert.equal(setup.calls[1].method, 'POST');
  assert.equal(setup.calls[1].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(setup.calls[1].headers['remix-userid'], '42');
  assert.equal(setup.calls[1].headers['remix-userkey'], 'fixture-session-key');
  const body = new URLSearchParams(setup.calls[1].body);
  assert.equal(body.get('message'), '9780141439518');
  assert.equal(body.get('page'), '1');
  assert.equal(body.get('limit'), '10');
  assert.equal(body.get('order'), 'relevance');
  assert.deepEqual(body.getAll('languages[]'), ['english']);
  assert.deepEqual(body.getAll('extensions[]'), ['epub', 'azw3', 'mobi', 'pdf']);
  assert.equal(setup.calls[0].body.includes('fixture-password'), true);
  assert.equal(setup.logs.some((line) => /fixture-password|fixture-session-key|fixture@example.invalid/.test(line)), false);
}
{
  const setup = eapiCase([fixture('eapi-text.json')]);
  const results = await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.deepEqual(results.map((r) => r.guid), ['202:Pdf456', '203:Epub789'], 'title/author search and malformed rows');
  assert.equal(new URLSearchParams(setup.calls[1].body).get('message'), 'Pride and Prejudice Jane Austen');
  assert.equal(results[0].format, 'pdf');
  assert.equal(results[0].isbn, undefined, 'missing ISBN omitted');
  assert.equal(results[0].sizeBytes, null, 'missing size is null');
  assert.equal(results[1].format, 'epub');
  assert.equal(results[1].sizeBytes, 2048);
}
{
  const setup = eapiCase([fixture('eapi-empty.json'), fixture('eapi-text.json')]);
  const results = await plugin.search({ ...titleQuery, isbn13: '9780141439518' }, setup.config, setup.testHost);
  assert.equal(results.length, 2, 'ISBN miss falls back to text');
  assert.deepEqual(setup.calls.slice(1).map((call) => new URLSearchParams(call.body).get('message')),
    ['9780141439518', 'Pride and Prejudice Jane Austen']);
}
{
  const setup = eapiCase([fixture('eapi-empty.json')]);
  assert.deepEqual(await plugin.search(titleQuery, setup.config, setup.testHost), [], 'empty response');
}
{
  const setup = eapiCase([fixture('eapi-empty.json'), fixture('eapi-empty.json'), fixture('eapi-empty.json')]);
  await plugin.search(titleQuery, setup.config, setup.testHost);
  await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 1,
    'valid session reused across searches');
  setup.config.credential = 'replacement-fixture-password';
  await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2,
    'changed credential invalidates cached session');
}
{
  const setup = eapiCase([
    { body: { success: 0 }, status: 401 }, fixture('eapi-empty.json'),
  ]);
  assert.deepEqual(await plugin.search(titleQuery, setup.config, setup.testHost), [],
    'expired search session is retried');
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/book/search')).length, 2);
}
{
  const setup = eapiCase([
    { body: { success: 0, error: 'session expired' }, status: 200 }, fixture('eapi-empty.json'),
  ]);
  assert.deepEqual(await plugin.search(titleQuery, setup.config, setup.testHost), [],
    'body-level session expiry is retried');
}
{
  const setup = eapiCase([
    { body: { success: 0 }, status: 401 }, { body: { success: 0 }, status: 401 },
  ]);
  await assert.rejects(plugin.search(titleQuery, setup.config, setup.testHost), { failure: 'unauthorized' });
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/book/search')).length, 2,
    'failed retry stops after one attempt');
}
{
  const setup = eapiCase([], fixture('eapi-auth-failure.json'));
  await assert.rejects(plugin.search(titleQuery, setup.config, setup.testHost), { failure: 'unauthorized' });
  assert.equal((await plugin.test(setup.config, setup.testHost)).success, false, 'authentication failure test');
  assert.equal(setup.calls.every((call) => call.url.endsWith('/user/login')), true);
}
{
  const setup = eapiCase([], fixture('eapi-auth-failure.json'), {}, 400);
  await assert.rejects(plugin.search(titleQuery, setup.config, setup.testHost), { failure: 'unauthorized' });
}
{
  const setup = eapiCase([fixture('eapi-live-search-isbn.json')]);
  const results = await plugin.search({ ...titleQuery, isbn13: '9780141439518' }, setup.config, setup.testHost);
  assert.equal(results.length, 2, 'ISBN pass keeps valid releases without identifier');
  assert.equal(results[0].isbn, '9780141439518; 0141439513');
  assert.equal(results[0].sizeBytes, 1200000, 'numeric filesize is bytes');
  assert.equal(results[1].isbn, undefined, 'missing identifier does not invent ISBN');
  assert.equal(results[1].format, 'pdf');
  assert.equal(results[1].sizeBytes, 2100000);
  assert.equal(setup.calls.length, 2, 'valid ISBN search results need no fallback');
}
{
  const setup = eapiCase([fixture('eapi-live-search-text.json')]);
  const results = await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.deepEqual(results.map((r) => r.format), ['pdf', 'epub']);
  assert.equal(results[0].sizeBytes, 2300000);
  assert.equal(results[1].sizeBytes, null, 'optional size missing');
  assert.equal(results[1].isbn, undefined, 'optional ISBN missing');
}
{
  const setup = eapiCase([], { success: 1 }, { 'set-cookie': 'remix_userid=fixture-user; Path=/, remix_userkey=fixture-key; Path=/' });
  assert.equal((await plugin.test(setup.config, setup.testHost)).success, true, 'response cookie session fallback');
}
{
  const setup = eapiCase([], { success: 1, user: { id: '', remix_userkey: '' } },
    { 'set-cookie': 'remix_userid=fixture-user; Path=/, remix_userkey=fixture-key; Path=/' });
  assert.equal((await plugin.test(setup.config, setup.testHost)).success, true, 'empty JSON session values use cookie fallback');
}
{
  const setup = eapiCase([fixture('eapi-empty.json')], fixture('eapi-login.json'),
    { 'set-cookie': 'remix_userid=wrong-cookie-id; Path=/, remix_userkey=wrong-cookie-key; Path=/' });
  await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(setup.calls[1].headers['remix-userid'], '42', 'JSON user ID wins over cookie');
  assert.equal(setup.calls[1].headers['remix-userkey'], 'fixture-session-key', 'JSON user key wins over cookie');
}
{
  const setup = eapiCase([fixture('eapi-size-fallback.json')]);
  const [result] = await plugin.search(titleQuery, setup.config, setup.testHost);
  assert.equal(result.sizeBytes, 512000, 'display size used only when numeric size is missing');
}
{
  const response = Response.json({ success: 1, user: { id: 42, remix_userkey: 'fixture-secret', email: 'fixture@example.invalid' } },
    { headers: { 'set-cookie': 'remix_userid=fixture-user; remix_userkey=fixture-secret' } });
  const summary = JSON.stringify(summarize('/eapi/user/login', response, await response.json()));
  assert.equal(/fixture-secret|fixture-user|fixture@example.invalid/.test(summary), false, 'shape summary redacts values');
  assert.equal(summary.includes('body.user.remix_userkey'), true, 'session source path is retained');
}
{
  const privateUrl = 'https://personal.example.invalid/path/123?token=fixture-secret&expires=123';
  const response = Response.json({ success: 1, file: { downloadLink: privateUrl, allowDownload: true, extension: 'EPUB' } });
  const summary = JSON.stringify(summarize('/eapi/book/123/Hash123/file', response, await response.json(), 'https://example.invalid'));
  assert.equal(summary.includes(privateUrl) || summary.includes('Hash123') || summary.includes('fixture-secret'), false,
    'resolution probe redacts URL and provider identifiers');
  assert.equal(summary.includes('"downloadUrlExists":true'), true);
  assert.equal(summary.includes('"downloadUrlHostDiffersFromBase":true'), true);
}
const selectedRelease = { guid: '101:AbC123', title: 'Bad:/\\ *Title?\n', author: 'A|B<>', format: 'pdf', sizeBytes: 123456 };
{
  const setup = eapiCase([fixture('eapi-empty.json'), fixture('eapi-file-success.json')]);
  await Promise.all([
    plugin.search(titleQuery, setup.config, setup.testHost),
    plugin.resolveFile(selectedRelease, setup.config, setup.testHost),
  ]);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 1,
    'search and file resolution share a pending login');
}
for (const expiresAgain of [false, true]) {
  const expired = { success: 0, error: 'session expired' };
  const setup = eapiCase([expired, expiresAgain ? expired : fixture('eapi-file-success.json')]);
  if (expiresAgain) {
    await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost), { failure: 'unauthorized' });
  } else {
    assert.equal((await plugin.resolveFile(selectedRelease, setup.config, setup.testHost)).format, 'epub');
  }
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/file')).length, 2,
    'HTTP 200 body-level file expiry retries once and stops if the renewed session also fails');
}
{
  const setup = eapiCase([{ success: 0, error: 'daily download quota reached' }]);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost),
    { failure: 'error', message: 'Z-Library download limit reached' });
  assert.equal(setup.calls.length, 2, 'download quotas do not trigger login or resolution retries');
}
for (const path of ['/user/login', '/book/search', '/file']) {
  for (const kind of ['tagged', 'TimeoutError', 'AbortError']) {
    const setup = eapiCase([]);
    const originalFetch = setup.testHost.fetch;
    const error = kind === 'tagged' ? host.fail('timeout', 'fixture host timeout')
      : new DOMException('private transport detail', kind);
    setup.testHost.fetch = (url, init) => url.endsWith(path) ? Promise.reject(error) : originalFetch(url, init);
    const operation = path === '/file' ? plugin.resolveFile(selectedRelease, setup.config, setup.testHost)
      : plugin.search(titleQuery, setup.config, setup.testHost);
    await assert.rejects(operation, (caught) => caught.failure === 'timeout' &&
      (kind === 'tagged' ? caught === error : !caught.message.includes('private transport detail')),
    `${kind} at ${path} retains timeout classification without exposing raw transport details`);
  }
}
{
  const setup = eapiCase([fixture('eapi-file-success.json')]);
  const file = await plugin.resolveFile(selectedRelease, setup.config, setup.testHost);
  assert.equal(file.url, fixture('eapi-file-success.json').file.downloadLink);
  assert.equal(file.format, 'epub', 'resolved extension wins');
  assert.equal(file.sizeBytes, 123456);
  assert.equal(file.fileName, 'Bad Title - A B.epub', 'unsafe filename characters removed');
  assert.equal(setup.calls.length, 2, 'login and one resolution request only');
  assert.equal(setup.calls[1].url, 'https://example.invalid/eapi/book/101/AbC123/file');
  assert.equal(setup.calls[1].method, 'GET');
  assert.equal(setup.calls[1].headers['remix-userid'], '42');
  assert.equal(setup.calls[1].headers['remix-userkey'], 'fixture-session-key');
  assert.match(setup.calls[1].headers.Cookie, /remix_userid=/);
  assert.equal(setup.logs.some((line) => /fixture-session-key|fixture-password|download\.example/.test(line)), false);
}
for (const [fixtureName, expected] of [
  ['eapi-file-no-object.json', /no file record/],
  ['eapi-file-no-link.json', /no download link/],
  ['eapi-file-limit.json', /download limit reached or book unavailable/],
  ['eapi-file-malformed.json', /no file record/],
]) {
  const setup = eapiCase([fixture(fixtureName)]);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost),
    (error) => error.failure === 'error' && expected.test(error.message), fixtureName);
}
{
  const setup = eapiCase([{ body: { success: 0, error: 'unavailable' }, status: 200 }]);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost),
    { failure: 'error', message: 'book is no longer available' });
}
for (const [status, failure] of [[401, 'unauthorized'], [404, 'error'], [429, 'throttled']]) {
  const reply = { body: { success: 0 }, status };
  const setup = eapiCase(status === 401 ? [reply, reply] : [reply]);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost), { failure });
}
{
  const setup = eapiCase([
    { body: { success: 0 }, status: 401 },
    fixture('eapi-file-success.json'),
  ]);
  const file = await plugin.resolveFile(selectedRelease, setup.config, setup.testHost);
  assert.equal(file.format, 'epub', 'stale session is renewed once');
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/user/login')).length, 2);
  assert.equal(setup.calls.filter((call) => call.url.endsWith('/file')).length, 2);
}
{
  const setup = eapiCase([{ success: 1, file: {
    downloadLink: 'https://download.example.invalid/fallback', allowDownload: true,
  } }]);
  const file = await plugin.resolveFile(selectedRelease, setup.config, setup.testHost);
  assert.equal(file.format, 'pdf', 'release format fallback');
  assert.equal(file.fileName.endsWith('.pdf'), true);
}
{
  const setup = eapiCase([fixture('eapi-file-success.json')]);
  await assert.rejects(plugin.resolveFile({ ...selectedRelease, guid: 'broken' }, setup.config, setup.testHost),
    { failure: 'error' });
  await assert.rejects(plugin.resolveFile({ ...selectedRelease, guid: '101:' }, setup.config, setup.testHost),
    { failure: 'error' });
  await assert.rejects(plugin.resolveFile({ ...selectedRelease, guid: ':AbC123' }, setup.config, setup.testHost),
    { failure: 'error' });
  assert.equal(setup.calls.length, 0, 'invalid ID or hash refused before login');
}
{
  const setup = eapiCase([]);
  const originalFetch = setup.testHost.fetch;
  setup.testHost.fetch = (url, init) => url.endsWith('/file')
    ? Promise.reject(new Error('network reset')) : originalFetch(url, init);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost), { failure: 'unreachable' });
}
{
  const setup = eapiCase([]);
  const originalFetch = setup.testHost.fetch;
  setup.testHost.fetch = (url, init) => url.endsWith('/file')
    ? Promise.resolve(new Response('not json', { status: 200 })) : originalFetch(url, init);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost), { failure: 'error' });
}
{
  const setup = eapiCase([]);
  setup.testHost.fetch = async () => { throw new Error('private URL and credentials must stay hidden'); };
  await assert.rejects(plugin.search(titleQuery, setup.config, setup.testHost),
    (error) => error.failure === 'unreachable' && !error.message.includes('private URL'));
}
{
  const setup = eapiCase([{ success: 1, file: {
    downloadLink: 'http://download.example.invalid/unsafe', allowDownload: true, extension: 'epub',
  } }]);
  await assert.rejects(plugin.resolveFile(selectedRelease, setup.config, setup.testHost), { failure: 'error' });
}
{
  const setup = eapiCase([fixture('eapi-file-success.json')]);
  const file = await plugin.resolveFile({ ...selectedRelease, title: 'X'.repeat(300), author: 'Y'.repeat(300) },
    setup.config, setup.testHost);
  assert.equal(file.fileName.length <= 155, true, 'filename capped');
}
console.log('zlib: all offline checks passed');
