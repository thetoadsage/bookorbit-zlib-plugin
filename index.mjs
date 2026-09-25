/** BookOrbit API v1 indexer. Mock by default; EAPI resolves files at grab time. */
const VERSION = '0.1.0';
const FORMATS = ['epub', 'azw3', 'mobi', 'pdf'];
const MOCK_BOOKS = [{
  guid: 'gutenberg-1342-epub', title: 'Pride and Prejudice', author: 'Jane Austen',
  isbn: '9780141439518', format: 'epub',
  url: 'https://www.gutenberg.org/ebooks/1342.epub3.images',
}];
const sessions = new Map(); // remix values stay in this process
const LANGUAGE_NAMES = { en: 'english', eng: 'english', de: 'german', deu: 'german', fr: 'french', fra: 'french', es: 'spanish', spa: 'spanish' };
const LANGUAGE_CODES = { english: 'en', german: 'de', french: 'fr', spanish: 'es' };

const mockProvider = {
  async search(query, _config, host, formats) {
    const isbn = cleanIsbn(query.isbn13);
    const text = host.buildSearchText(query).toLowerCase();
    return MOCK_BOOKS.filter((book) => formats.includes(book.format) && (
      (isbn && book.isbn === isbn) ||
      (query.title && text.includes(book.title.toLowerCase()) &&
        (!query.author || text.includes(book.author.toLowerCase())))
    )).slice(0, Math.max(0, query.limit ?? 20)).map((book) => ({
      guid: book.guid, title: book.title, bookTitle: book.title,
      author: book.author, isbn: book.isbn, format: book.format,
      sizeBytes: null, seeders: null, leechers: null, primaryFileCount: 1,
    }));
  },
  async test() { return { success: true, indexerName: 'Z-Library (offline mock)' }; },
  resolveFile(release, _config, host) {
    const book = MOCK_BOOKS.find((item) => item.guid === release.guid && item.format === release.format);
    if (!book) throw host.fail('error', 'unknown test release');
    return { url: book.url, fileName: `${book.title}.${book.format}`, sizeBytes: null, format: book.format };
  },
};

const eapiProvider = {
  async search(query, config, host, formats) {
    let session = await login(config, host);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const isbn = cleanIsbn(query.isbn13);
    const text = host.buildSearchText(query).trim();
    const run = async () => {
      let releases = isbn ? await searchPage(isbn, limit, query, formats, config, host, session) : [];
      if (releases.length === 0 && text && text !== isbn) {
        releases = await searchPage(text, limit, query, formats, config, host, session);
      }
      return releases.slice(0, limit);
    };
    try { return await run(); }
    catch (error) {
      if (error?.failure !== 'unauthorized') throw error;
      sessions.delete(sessionKey(config));
      session = await login(config, host);
      return run();
    }
  },
  async test(config, host) {
    try {
      sessions.delete(sessionKey(config));
      await login(config, host);
      return { success: true, indexerName: 'Z-Library' };
    } catch {
      return { success: false, error: 'Z-Library EAPI authentication failed' };
    }
  },
  async resolveFile(release, config, host) {
    const match = /^(\d+):([A-Za-z0-9]+)$/.exec(release?.guid ?? '');
    if (!match) throw host.fail('error', 'release is missing a valid Z-Library book ID or hash');
    let session = await login(config, host);
    const path = `/eapi/book/${match[1]}/${match[2]}/file`;
    let data;
    try { data = await getFileResponse(config, host, path, session); }
    catch (error) {
      if (error?.failure !== 'unauthorized') throw error;
      sessions.delete(sessionKey(config));
      session = await login(config, host);
      data = await getFileResponse(config, host, path, session);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw host.fail('error', 'unexpected file-resolution response');
    }
    if (data.success === 0) {
      const reason = String(data.error ?? data.message ?? '');
      if (isAuthFailure(data)) throw host.fail('unauthorized', 'Z-Library session expired');
      if (/limit|quota|daily/i.test(reason)) throw host.fail('error', 'Z-Library download limit reached');
      if (/removed|unavailable|not found|deleted/i.test(reason)) throw host.fail('error', 'book is no longer available');
      throw host.fail('error', 'Z-Library could not resolve this book');
    }
    if (data.success !== 1) throw host.fail('error', 'unexpected file-resolution response');
    const file = data.file;
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw host.fail('error', 'Z-Library returned no file record');
    }
    if (file.allowDownload === false) throw host.fail('error', 'Z-Library download limit reached or book unavailable');
    if (typeof file.downloadLink !== 'string' || !file.downloadLink.trim()) {
      throw host.fail('error', 'Z-Library returned no download link');
    }
    let url;
    try {
      url = new URL(file.downloadLink.trim());
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid URL');
    } catch { throw host.fail('error', 'Z-Library returned an invalid download URL'); }
    const resolvedFormat = String(file.extension ?? '').trim().toLowerCase();
    const fallbackFormat = String(release.format ?? '').trim().toLowerCase();
    const format = FORMATS.includes(resolvedFormat) ? resolvedFormat : fallbackFormat;
    if (!FORMATS.includes(format)) throw host.fail('error', 'release has no supported file format');
    return {
      url: url.href,
      fileName: fileName(release.title, release.author, format),
      sizeBytes: Number.isFinite(release.sizeBytes) && release.sizeBytes >= 0 ? release.sizeBytes : null,
      format,
    };
  },
};

export default {
  apiVersion: 1,
  version: VERSION,
  type: 'zlib',
  label: 'Z-Library',
  requiresCredential: true,
  credentialKind: 'apiKey', // BookOrbit's credential field holds the EAPI password.
  mediaKinds: ['ebook'],
  supportsIsbnSearch: true,
  usesCategories: false,
  seedsBack: false,
  defaultBaseUrl: 'https://www.gutenberg.org',
  baseUrlHint: 'Mock mode is offline. For EAPI mode, enter your own HTTPS Z-Library base URL.',
  settingsFields: [
    { key: 'provider', type: 'string', label: 'Provider (mock or eapi)', default: 'mock' },
    { key: 'email', type: 'string', label: 'Z-Library email', default: '' },
    { key: 'ebookFormats', type: 'string', label: 'Ebook formats', default: FORMATS.join(','), format: 'list', options: FORMATS, minItems: 1 },
    { key: 'languages', type: 'string', label: 'Languages', default: '', format: 'list' },
  ],
  async search(query, config, host, signal) {
    if (query.mediaKind !== 'ebook') throw host.fail('unsupportedMedium', 'only ebooks are available');
    if (signal?.aborted) return [];
    const formats = list(config.settings?.ebookFormats || FORMATS.join(',')).filter((value) => FORMATS.includes(value));
    if (formats.length === 0) throw host.fail('unsupportedMedium', 'no supported ebook formats are configured');
    const releases = await provider(config, host).search(query, config, host, formats);
    host.logger.log(`[zlib.search] found=${releases.length}`);
    return releases;
  },
  async test(config, host) {
    try { return await provider(config, host).test(config, host); }
    catch { return { success: false, error: 'Invalid provider configuration' }; }
  },
  async resolveFile(release, config, host) {
    const file = await provider(config, host).resolveFile(release, config, host);
    host.logger.log(`[zlib.resolve] format=${file.format}`);
    return file;
  },
};

function provider(config, host) {
  const mode = config.settings?.provider || 'mock';
  if (mode === 'mock') return mockProvider;
  if (mode === 'eapi') return eapiProvider;
  throw host.fail('error', 'provider must be mock or eapi');
}
function list(value) { return String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean); }
function cleanIsbn(value) { return String(value ?? '').replace(/[^0-9X]/gi, '').toUpperCase(); }
function sessionKey(config) { return `${config.id}:${config.baseUrl}:${String(config.settings?.email ?? '').trim()}`; }
function eapiUrl(config, path, host) {
  try {
    const base = new URL(config.baseUrl);
    if (base.protocol !== 'https:') throw new Error('HTTPS required');
    return new URL(path, base).href;
  } catch { throw host.fail('error', 'EAPI requires a valid HTTPS base URL'); }
}
async function login(config, host) {
  const email = String(config.settings?.email ?? '').trim();
  const password = config.credential;
  if (!email || !password) throw host.fail('unauthorized', 'EAPI email and password are required');
  const key = sessionKey(config);
  const cached = sessions.get(key);
  if (cached?.credential === password) return cached.session;
  sessions.delete(key);
  let responseHeaders;
  const data = await post(config, host, '/eapi/user/login', { email, password }, null, (headers) => { responseHeaders = headers; });
  const user = data?.user ?? data?.response;
  const cookie = responseHeaders?.getSetCookie?.().join(', ') || responseHeaders?.get('set-cookie') || '';
  const id = String(firstPresent(user?.id, user?.user_id, cookieValue(cookie, 'remix_userid')));
  const userkey = String(firstPresent(user?.remix_userkey, user?.user_key, cookieValue(cookie, 'remix_userkey')));
  if (data?.success === 0 || !id || !userkey) throw host.fail('unauthorized', 'EAPI authentication failed');
  const session = { id, userkey };
  sessions.set(key, { credential: password, session });
  return session;
}
async function searchPage(message, limit, query, formats, config, host, session) {
  const languages = list(config.settings?.languages || (LANGUAGE_NAMES[query.language?.toLowerCase()] ?? query.language ?? ''));
  const params = new URLSearchParams({ message, page: '1', limit: String(limit), order: 'relevance' });
  for (const value of languages) params.append('languages[]', LANGUAGE_NAMES[value] ?? value);
  for (const value of formats) params.append('extensions[]', value);
  const data = await post(config, host, '/eapi/book/search', params, session);
  if (data?.success === 0) {
    if (isAuthFailure(data)) throw host.fail('unauthorized', 'EAPI session expired');
    throw host.fail('error', 'EAPI search failed');
  }
  if (!Array.isArray(data?.books)) throw host.fail('error', 'EAPI search response has no books array');
  return data.books.map((book) => normalizeBook(book, formats)).filter(Boolean);
}
async function post(config, host, path, params, session, inspectHeaders) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', ...authHeaders(session) };
  let response;
  const url = eapiUrl(config, path, host);
  try { response = await host.fetch(url, { method: 'POST', headers, body: new URLSearchParams(params).toString(), redirect: 'manual' }); }
  catch { throw host.fail('unreachable', 'EAPI request could not be completed'); }
  if (response.status === 401 || response.status === 403) throw host.fail('unauthorized', 'EAPI rejected the request');
  if (path === '/eapi/user/login' && response.status === 400) throw host.fail('unauthorized', 'EAPI rejected the login');
  if (response.status === 429) throw host.fail('throttled', 'EAPI is rate limiting requests');
  if (!response.ok) throw host.fail('error', `EAPI returned HTTP ${response.status}`);
  inspectHeaders?.(response.headers);
  try { return await response.json(); }
  catch { throw host.fail('error', 'EAPI returned invalid JSON'); }
}
function authHeaders(session) {
  const headers = { 'User-Agent': 'BookOrbit zlib' };
  if (session) {
    headers['remix-userid'] = session.id;
    headers['remix-userkey'] = session.userkey;
    headers.Cookie = `remix_userid=${session.id}; remix_userkey=${session.userkey}`;
  }
  return headers;
}
async function getFileResponse(config, host, path, session) {
  let response;
  try {
    response = await host.fetch(eapiUrl(config, path, host), {
      method: 'GET', headers: authHeaders(session), redirect: 'manual',
    });
  } catch (error) {
    if (error?.failure) throw error;
    throw host.fail('unreachable', 'Z-Library file endpoint could not be reached');
  }
  if (response.status === 401 || response.status === 403) throw host.fail('unauthorized', 'Z-Library rejected the session');
  if (response.status === 404 || response.status === 410) throw host.fail('error', 'book is no longer available');
  if (response.status === 429) throw host.fail('throttled', 'Z-Library is rate limiting requests');
  if (!response.ok) throw host.fail('error', `Z-Library file endpoint returned HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw host.fail('error', 'unexpected file-resolution response'); }
}
function fileName(title, author, format) {
  const safe = (value) => String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').trim();
  const name = [safe(title), safe(author)].filter(Boolean).join(' - ').slice(0, 150)
    .replace(/[.\s]+$/g, '') || 'book';
  return `${name}.${format}`;
}
function normalizeBook(book, formats) {
  if (!book || typeof book !== 'object') return null;
  const id = String(book.id ?? '').trim();
  const hash = typeof book.hash === 'string' ? book.hash.trim() : '';
  const title = typeof book.title === 'string' ? book.title.trim() : '';
  const format = typeof book.extension === 'string' ? book.extension.trim().toLowerCase() : '';
  if (!/^\d+$/.test(id) || !/^[a-zA-Z0-9]+$/.test(hash) || !title || !formats.includes(format)) return null;
  const author = typeof book.author === 'string' ? book.author.trim() : '';
  const isbn = isbnsOf(book);
  const language = typeof book.language === 'string' ? book.language.trim().toLowerCase() : '';
  const sizeBytes = Number.isFinite(book.filesize) && book.filesize >= 0
    ? book.filesize : parseSize(book.sizeBytes ?? book.filesizeString ?? book.size);
  return {
    guid: `${id}:${hash}`, title, bookTitle: title, format, sizeBytes,
    seeders: null, leechers: null, primaryFileCount: 1,
    ...(author ? { author } : {}), ...(isbn ? { isbn } : {}),
    ...(language ? { language: LANGUAGE_CODES[language] ?? language } : {}),
  };
}
function isbnsOf(book) {
  const source = [book.isbn, book.isbn13, book.identifier].filter((value) => typeof value === 'string').join(' ');
  return [...new Set((source.match(/\b97[89]\d{10}\b|\b\d{9}[\dXx]\b/g) ?? []).map((value) => value.toUpperCase()))].join('; ');
}
function cookieValue(header, name) {
  const match = new RegExp(`(?:^|[,;]\\s*)${name}=([^;,\\s]+)`, 'i').exec(header);
  return match?.[1];
}
function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim()) ?? '';
}
function isAuthFailure(data) {
  const reason = String(data?.error ?? data?.message ?? '');
  return /unauthori[sz]ed|session|log.?in|sign.?in|authentication|expired/i.test(reason);
}
function parseSize(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const match = /^\s*([\d,.]+)\s*([kmgt]?i?b)?\s*$/i.exec(value);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ''));
  const units = { b: 1, kb: 1000, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
  const bytes = number * (units[match[2]?.toLowerCase() ?? 'b'] ?? 1);
  return Number.isFinite(bytes) && bytes >= 0 ? Math.round(bytes) : null;
}
