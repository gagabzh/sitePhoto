'use strict';

// Session TTL — 30 days in milliseconds.
// Used in session cookie maxAge (session.js) and last-seen calculation (routes/account.js).
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = { SESSION_MAX_AGE_MS };
