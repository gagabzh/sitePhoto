'use strict';

// ── ACC-4: Inline user-agent parser — no new npm packages ────────────────────
// Returns a short human-readable label ("Chrome on macOS", "Safari on iPhone", etc.)

function parseUserAgent(ua) {
  if (!ua) return 'Unknown device';

  // Mobile OS detection
  const isIPhone  = /iPhone/i.test(ua);
  const isIPad    = /iPad/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile  = isIPhone || isIPad || isAndroid;

  let os;
  if (isIPhone)       os = 'iPhone';
  else if (isIPad)    os = 'iPad';
  else if (isAndroid) os = 'Android';
  else if (/Windows/i.test(ua))  os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua))    os = 'Linux';
  else                           os = null;

  // Browser detection — order matters: Edge before Chrome, Mobile Safari before Safari
  let browser;
  if (/Edg\//i.test(ua))                         browser = 'Edge';
  else if (/Firefox\//i.test(ua))                 browser = 'Firefox';
  else if (isMobile && /Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Mobile Safari';
  else if (/Chrome\//i.test(ua))                  browser = 'Chrome';
  else if (/Safari\//i.test(ua))                  browser = 'Safari';
  else                                             browser = null;

  if (browser && os)  return `${browser} on ${os}`;
  if (browser)        return browser;
  if (os)             return `Unknown browser on ${os}`;
  // Final fallback: truncate raw UA to 60 chars
  return ua.length > 60 ? ua.slice(0, 60) + '…' : ua;
}

// ── ACC-4: Relative time helper ───────────────────────────────────────────────

function relativeTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec  = Math.floor(diffMs / 1000);
  const diffMin  = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay  = Math.floor(diffHour / 24);

  if (diffSec < 60)   return 'just now';
  if (diffMin < 60)   return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHour < 24)  return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  if (diffDay < 30)   return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`;
}

module.exports = { parseUserAgent, relativeTime };
