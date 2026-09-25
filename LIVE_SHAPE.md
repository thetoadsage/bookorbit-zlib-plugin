# EAPI shape observations

Anonymous metadata requests to the user-supplied `https://z-lib.gd` base on 2026-09-25 returned HTTP 200. The text query returned ten records (EPUB, PDF, MOBI among them). An ISBN query returned five EPUB records. No raw responses were saved.

An empty-credential login probe returned HTTP 400 with top-level `success` (number) and `error` (string), and no session fields. This is a failure shape only.

The search response had top-level `success` (number), `books` (array), `exactBooksCount` (number), and `pagination` (object). Pagination contained `before`, `current`, `limit`, `next`, `total_items`, and `total_pages`. Sample books contained `id` (number), `hash` (string), `title` (string), `author` (string), `identifier` (string), `extension` (string), `language` (string), `filesize` (number), and `filesizeString` (string). Sample book objects also exposed `href`, `dl`, and `readOnlineUrl` string fields, whose values were not retained. No `isbn` or `isbn13` key appeared in the sampled records. The ISBN-query sample's `identifier` contained the requested ISBN.

All five ISBN-query records passed the adapter's ID, hash, title, and format checks, and its ISBN extraction matched the query in all five. The numeric `filesize` agreed with the displayed `filesizeString` after applying its unit.

The included `eapi-live-search-*.json` fixtures retain this response nesting and core field types with synthetic book identifiers, titles, hashes, authors, and sizes. They are schema-derived sanitized fixtures, not raw copies. Optional URL and description fields were removed. The second ISBN fixture row models the confirmed case where `identifier` is missing; it remains a valid release.

## Authenticated confirmation

The user subsequently ran live authenticated validation. A successful login supplied `remix-userid` at `body.user.id` and `remix-userkey` at `body.user.remix_userkey`. The response also supplied `remix_userid` and `remix_userkey` cookies. The adapter prefers the JSON fields and reads cookies only if they are absent. No values are stored in fixtures or logs. Authenticated `/eapi/book/search` succeeded.

Confirmed metadata fields include `id`, `hash`, `title`, `author`, `identifier`, `extension`, `language`, `filesize`, `filesizeString`, `year`, `publisher`, `pages`, `md5`, and `sha256`. `identifier` may be empty or absent. Numeric `filesize` maps directly to `sizeBytes`; `filesizeString` is a fallback. The release `guid` preserves the provider ID and hash.

## File resolution

The user ran one authenticated resolution probe after selecting one search result. `GET /eapi/book/{id}/{hash}/file` returned HTTP 200 with top-level `success` (number) and `file` (object). The file object contained `allowDownload` (boolean), `author` (string), `description` (string), `downloadLink` (string), and `extension` (string). In the probed response, `allowDownload` was true and `extension` was `epub`. The URL was HTTPS, on a different host from the EAPI base, and carried query parameters including an expiry or signature marker. It therefore appears temporary or personalized. The URL itself was never printed or saved, and the probe did not request file bytes.

The plugin asks this endpoint at grab time and returns the resolved URL to BookOrbit. A prior `zlib-test` deployment completed a direct file download and EPUB import; BookOrbit's import verification passed. This local cleanup renames the plugin to `zlib` and has not been deployed.
