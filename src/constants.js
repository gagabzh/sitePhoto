'use strict';

// Session TTL — 7 days in milliseconds.
// Used in session cookie maxAge (session.js) and last-seen calculation (routes/account.js).
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = { SESSION_MAX_AGE_MS };
