/** Developer-only EAPI shape probe. Never prints response values or request headers. */
import { fileURLToPath } from 'node:url';
import plugin from './index.mjs';

const SENSITIVE = /email|password|token|secret|cookie|session|remix|authorization|user.?key|user.?id/i;
const typeOf = (value) => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
const safeKeys = (value) => value && typeof value === 'object'
  ? Object.keys(value).filter((key) => !SENSITIVE.test(key) && /^[a-z][a-z0-9_-]{0,39}$/i.test(key)).sort()
  : [];
const fields = (value) => Object.fromEntries(safeKeys(value).map((key) => [key, typeOf(value[key])]));
const has = (value) => value !== undefined && value !== null && String(value).length > 0;
function sizeFieldsAgree(book) {
  if (typeof book?.filesize !== 'number' || typeof book?.filesizeString !== 'string') return null;
  const match = /^\s*([\d,.]+)\s*(KB|MB|GB|KiB|MiB|GiB)\s*$/i.exec(book.filesizeString);
  if (!match) return null;
  const units = { kb: 1000, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
  const displayed = Number(match[1].replace(/,/g, '')) * units[match[2].toLowerCase()];
  return displayed > 0 && Math.abs(displayed - book.filesize) / book.filesize < 0.1;
}

export function summarize(path, response, data, baseUrl) {
  const isFile = /^\/eapi\/book\/\d+\/[A-Za-z0-9]+\/file$/.test(path);
  const isBook = /^\/eapi\/book\/\d+\/[A-Za-z0-9]+(?:\/formats)?$/.test(path);
  const out = { endpoint: isFile ? '/eapi/book/{id}/{hash}/file'
    : isBook ? path.endsWith('/formats') ? '/eapi/book/{id}/{hash}/formats' : '/eapi/book/{id}/{hash}'
      : path, status: response.status, topLevel: fields(data) };
  if (path === '/eapi/user/login') {
    const user = data?.user ?? data?.response;
    out.login = {
      sessionSources: [
        ...(has(user?.id) ? ['body.user.id'] : []),
        ...(has(user?.user_id) ? ['body.response.user_id'] : []),
        ...(has(user?.remix_userkey) ? ['body.user.remix_userkey'] : []),
        ...(has(user?.user_key) ? ['body.response.user_key'] : []),
        ...(has(response.headers.get('remix-userid')) ? ['response.header.remix-userid'] : []),
        ...(has(response.headers.get('remix-userkey')) ? ['response.header.remix-userkey'] : []),
        ...((response.headers.get('set-cookie') ?? '').match(/remix_userid=/i) ? ['response.cookie.remix_userid'] : []),
        ...((response.headers.get('set-cookie') ?? '').match(/remix_userkey=/i) ? ['response.cookie.remix_userkey'] : []),
      ],
      userFields: fields(user),
    };
  } else if (isFile) {
    const file = data?.file;
    const link = typeof file?.downloadLink === 'string' ? file.downloadLink.trim() : '';
    let linkUrl;
    try { if (link) linkUrl = new URL(link); } catch { /* invalid link */ }
    let baseHost;
    try { if (baseUrl) baseHost = new URL(baseUrl).host; } catch { /* no comparison */ }
    out.file = {
      exists: !!file && typeof file === 'object' && !Array.isArray(file),
      fields: fields(file),
      downloadUrlExists: !!link,
      downloadUrlIsHttps: linkUrl?.protocol === 'https:',
      downloadUrlHasQuery: linkUrl ? !!linkUrl.search : null,
      downloadUrlHostDiffersFromBase: linkUrl && baseHost ? linkUrl.host !== baseHost : null,
      downloadUrlHasExpiryOrSignatureParam: linkUrl
        ? [...linkUrl.searchParams.keys()].some((key) => /^(?:exp|expires?|expiry|sig|signature|token|key)$/i.test(key))
        : null,
      allowDownloadExists: typeof file?.allowDownload === 'boolean',
      allowDownload: typeof file?.allowDownload === 'boolean' ? file.allowDownload : null,
      extension: ['epub', 'azw3', 'mobi', 'pdf'].includes(String(file?.extension ?? '').toLowerCase())
        ? String(file.extension).toLowerCase() : null,
    };
  } else if (isBook) {
    out.detail = { bookFields: fields(data?.book), formatsFields: fields(data?.formats) };
  } else {
    const booksPath = Array.isArray(data?.books) ? 'books'
      : Array.isArray(data?.exactMatch?.books) ? 'exactMatch.books' : null;
    const books = booksPath === 'books' ? data.books : booksPath ? data.exactMatch.books : [];
    out.search = {
      booksPath,
      count: books.length,
      firstBookFields: fields(books[0]),
      formats: Object.fromEntries(
        [...new Set(books.map((book) => String(book?.extension ?? '').toLowerCase()).filter((value) => ['epub', 'pdf', 'mobi', 'azw3'].includes(value)))]
          .map((value) => [value, books.filter((book) => String(book?.extension ?? '').toLowerCase() === value).length]),
      ),
      identifierLooksIsbn: books[0]?.identifier
        ? /(?:97[89][\d\s-]{10,}|\b\d{9}[\dXx]\b)/.test(String(books[0].identifier))
        : false,
      identifierShape: books[0]?.identifier
        ? (/^\d{13}$/.test(books[0].identifier) ? 'bare-isbn13'
          : /^\d{10}$/.test(books[0].identifier) ? 'bare-isbn10'
            : /isbn/i.test(books[0].identifier) ? 'labelled-isbn' : 'other')
        : 'absent-or-empty',
      sizeFieldsAgree: sizeFieldsAgree(books[0]),
      exactMatchFields: fields(data?.exactMatch),
      paginationFields: fields(data?.pagination),
    };
  }
  return out;
}

async function main() {
  const baseUrl = process.env.BOOKORBIT_ZLIB_BASE_URL;
  const email = process.env.BOOKORBIT_ZLIB_EMAIL;
  const password = process.env.BOOKORBIT_ZLIB_PASSWORD;
  if (!baseUrl || Boolean(email) !== Boolean(password)) {
    console.error('Set BOOKORBIT_ZLIB_BASE_URL; provide both EMAIL and PASSWORD for an authenticated check.');
    process.exitCode = 2;
    return;
  }
  let validBase = false;
  try { validBase = new URL(baseUrl).protocol === 'https:'; } catch { /* invalid URL */ }
  if (!validBase) {
    console.error('The EAPI base URL must use HTTPS.');
    process.exitCode = 2;
    return;
  }
  const config = {
    id: 1, baseUrl, credential: password,
    settings: { provider: 'eapi', email, ebookFormats: 'epub,azw3,mobi,pdf' },
  };
  const summaries = [];
  let searchAuthHeaders;
  const host = {
    buildSearchText: (query) => [query.title, query.author].filter(Boolean).join(' '),
    logger: { log() {}, warn() {} },
    fail: (failure, message) => Object.assign(new Error(message), { failure }),
    fetch: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/eapi/book/search') searchAuthHeaders = init.headers;
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
      let data;
      if (response.headers.get('content-type')?.includes('json')) {
        try { data = await response.clone().json(); } catch { /* shape remains unknown */ }
      }
      summaries.push(summarize(path, response, data, baseUrl));
      return response;
    },
  };
  let outcome = 'ok';
  try {
    if (email && password) {
      const login = await plugin.test(config, host);
      if (!login.success) throw host.fail('unauthorized', 'authentication failed');
      const releases = await plugin.search({
        mediaKind: 'ebook', title: 'Pride and Prejudice', author: 'Jane Austen',
        isbn13: null, language: null, limit: 10,
      }, config, host);
      if (process.argv.includes('--resolve-probe')) {
        const release = releases[0];
        const match = /^(\d+):([A-Za-z0-9]+)$/.exec(release?.guid ?? '');
        if (!match || !searchAuthHeaders) throw host.fail('error', 'no usable search release for resolution probe');
        const bookPath = `/eapi/book/${match[1]}/${match[2]}`;
        const request = { method: 'GET', redirect: 'manual', headers: searchAuthHeaders };
        const response = await host.fetch(new URL(`${bookPath}/file`, baseUrl).href, request);
        if (response.status === 404 || response.status === 405) {
          await host.fetch(new URL(bookPath, baseUrl).href, request);
          await host.fetch(new URL(`${bookPath}/formats`, baseUrl).href, request);
        }
      }
      const isbn = process.env.BOOKORBIT_ZLIB_ISBN;
      if (isbn) {
        await plugin.search({
          mediaKind: 'ebook', title: 'Pride and Prejudice', author: 'Jane Austen',
          isbn13: isbn, language: null, limit: 10,
        }, config, host);
      }
    } else {
      if (process.argv.includes('--resolve-probe')) throw host.fail('unauthorized', 'resolution probe requires credentials');
      outcome = 'anonymousProbeOnly';
      const loginEndpoint = new URL('/eapi/user/login', baseUrl);
      await host.fetch(loginEndpoint.href, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BookOrbit zlib' },
        body: new URLSearchParams({ email: '', password: '' }).toString(),
      });
      const endpoint = new URL('/eapi/book/search', baseUrl);
      for (const message of ['pride and prejudice', process.env.BOOKORBIT_ZLIB_ISBN].filter(Boolean)) {
        const body = new URLSearchParams({ message, page: '1', limit: '10', order: 'relevance' });
        const response = await host.fetch(endpoint.href, {
          method: 'POST', redirect: 'manual',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BookOrbit zlib' },
          body: body.toString(),
        });
        if (!response.ok) process.exitCode = 1;
      }
    }
  } catch (error) {
    outcome = error?.failure ?? 'requestFailed';
    process.exitCode = 1;
  }
  console.log(JSON.stringify({ outcome, responses: summaries }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
