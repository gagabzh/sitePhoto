'use strict';

// WebDAV client for Nextcloud public folder shares.
// Uses only Node.js built-ins (https) and @xmldom/xmldom (already a dep).
// No new npm packages.

const https = require('https');
const http = require('http');
const { DOMParser } = require('@xmldom/xmldom');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/gif':  '.gif',
  'image/webp': '.webp',
};
// Reject RFC 1918, loopback, and link-local addresses to prevent SSRF.
function isInternalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets from Node URL parser
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$)/.test(h)
    || h === 'localhost';
}

// Extract the share token from a Nextcloud public share URL.
// e.g. https://cloud.example.com/s/abc123def456 → 'abc123def456'
function extractToken(shareUrl) {
  try {
    const pathname = new URL(shareUrl).pathname;
    const token = pathname.split('/s/')[1]?.split('/')[0];
    return token || null;
  } catch {
    return null;
  }
}

// Validate that a URL is a Nextcloud folder share link.
// Returns true if valid.
function isValidNextcloudShareUrl(shareUrl) {
  if (typeof shareUrl !== 'string') return false;
  if (!/^https:\/\/.+\/s\/[^/]+/.test(shareUrl)) return false;
  try {
    const { hostname } = new URL(shareUrl);
    if (isInternalHost(hostname)) return false;
  } catch {
    return false;
  }
  return true;
}

// Make an HTTP/HTTPS request and collect the body as a string.
// Returns { statusCode, body }.
// Rejects after timeoutMs (default 10 000 ms).
function httpRequest({ method, url, headers, body, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      method,
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers:  headers || {},
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      const err = new Error('Request timed out');
      err.code = 'ETIMEDOUT';
      reject(err);
    });

    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}

// PROPFIND a Nextcloud public share and return a list of image files.
// Returns [{ name, size, mimeType }].
// Throws with `.httpStatus` set on error conditions:
//   401 → share expired / needs password
//   404 → share not found
//   504 → timeout
//   502 → XML parse failure or unexpected response
async function propfindShare(shareUrl) {
  const token = extractToken(shareUrl);
  if (!token) throw Object.assign(new Error('Could not extract token'), { httpStatus: 422 });

  // Defence-in-depth: reject internal hostnames even if isValidNextcloudShareUrl was bypassed
  try {
    const { hostname } = new URL(shareUrl);
    if (isInternalHost(hostname)) throw Object.assign(new Error('Invalid share URL.'), { httpStatus: 422 });
  } catch (e) {
    if (e.httpStatus) throw e;
    throw Object.assign(new Error('Invalid share URL.'), { httpStatus: 422 });
  }

  const webdavUrl = `${shareUrl}/public.php/webdav/`;
  const auth = Buffer.from(`${token}:`).toString('base64');

  const propfindBody = `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:getcontenttype/><D:getcontentlength/><D:displayname/></D:prop></D:propfind>`;

  let result;
  try {
    result = await httpRequest({
      method: 'PROPFIND',
      url: webdavUrl,
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml',
        Authorization: `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(propfindBody),
      },
      body: propfindBody,
      timeoutMs: 10000,
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT') {
      throw Object.assign(new Error('Nextcloud did not respond in time. Try again.'), { httpStatus: 504 });
    }
    throw err;
  }

  if (result.statusCode === 401) {
    throw Object.assign(
      new Error('Could not access this Nextcloud share. The link may have expired or require a password.'),
      { httpStatus: 422 },
    );
  }
  if (result.statusCode === 404) {
    throw Object.assign(
      new Error('Nextcloud share not found. Check the link and try again.'),
      { httpStatus: 422 },
    );
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw Object.assign(
      new Error(`Unexpected response from Nextcloud. Is the link a folder share?`),
      { httpStatus: 502 },
    );
  }

  // Parse XML
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(result.body, 'application/xml');
    // DOMParser from xmldom doesn't throw — check for parse error nodes
    const parseError = doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parseerror.xml', 'parseerror');
    if (parseError.length > 0) throw new Error('parse error');
  } catch {
    throw Object.assign(
      new Error('Unexpected response from Nextcloud. Is the link a folder share?'),
      { httpStatus: 502 },
    );
  }

  // Extract all D:response elements
  const responses = doc.getElementsByTagNameNS('DAV:', 'response');
  const files = [];

  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i];

    const contentTypeEl = resp.getElementsByTagNameNS('DAV:', 'getcontenttype');
    const mimeType = contentTypeEl[0]?.textContent?.trim().split(';')[0].trim() || '';

    // Skip collections (directories) and non-image files
    if (!ALLOWED_MIME_TYPES.has(mimeType)) continue;

    const displayNameEl = resp.getElementsByTagNameNS('DAV:', 'displayname');
    const contentLengthEl = resp.getElementsByTagNameNS('DAV:', 'getcontentlength');

    const name = displayNameEl[0]?.textContent?.trim() || '';
    const size = parseInt(contentLengthEl[0]?.textContent?.trim() || '0', 10);

    if (name) {
      files.push({ name, size, mimeType });
    }
  }

  return files;
}

// Download a file from a Nextcloud share. Returns a raw Buffer.
function downloadFileAsBuffer(shareUrl, fileName) {
  const token = extractToken(shareUrl);

  // Defence-in-depth: reject internal hostnames
  try {
    const { hostname } = new URL(shareUrl);
    if (isInternalHost(hostname)) return Promise.reject(Object.assign(new Error('Invalid share URL.'), { statusCode: 422 }));
  } catch {
    return Promise.reject(Object.assign(new Error('Invalid share URL.'), { statusCode: 422 }));
  }

  const fileUrl = `${shareUrl}/public.php/webdav/${encodeURIComponent(fileName)}`;
  const auth = Buffer.from(`${token}:`).toString('base64');
  const parsed = new URL(fileUrl);
  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers:  { Authorization: `Basic ${auth}` },
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain
        return reject(Object.assign(
          new Error(`Failed to download ${fileName}: HTTP ${res.statusCode}`),
          { statusCode: res.statusCode },
        ));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error(`Download of ${fileName} timed out`));
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { isValidNextcloudShareUrl, propfindShare, downloadFileAsBuffer, EXT_MAP };
