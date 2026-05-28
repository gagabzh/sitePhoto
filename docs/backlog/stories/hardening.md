# Code Quality & Hardening

## ACC-2/ACC-3 Follow-up (PR #81)

The following items were identified as non-blocking observations during the tech-lead review of PR #81 (`feat/acc-2-3-profile-avatar`). All are low-priority cleanup or hardening tasks.

**HRD-1 — Normalise cancel-button unicode character**
As a developer, I want the cancel button in inline profile editing to use the project-standard unicode character so that the UI is visually consistent.

*Technical note:* The cancel button in the account page inline-edit widget currently uses `✕` (U+2715 MULTIPLICATION X). Replace with `✗` (U+2717 BALLOT X) to match the convention used elsewhere in the project. Single character change in the relevant template or `page.js` helper.

**HRD-2 — Improve PATCH /account name validation error message**
As a logged-in user, when I submit a name that is too long, I receive a clear error message explaining the constraint, so I know exactly what to fix.

*Technical note:* `PATCH /account` currently returns `"Name is required"` for both an empty name and a name longer than 100 characters. The message should be `"Name must be 1–100 characters"` to cover both failure modes with a single accurate string. Update the validation block in `src/routes/account.js`.

**HRD-3 — Fix boolean coercion for notif_enabled in PATCH /account**
As a developer, I want the server to reject a string `"false"` for `notif_enabled` rather than silently coercing it to `true`, so client-side bugs surface immediately rather than corrupting user preferences.

*Technical note:* `Boolean(notif_enabled)` coerces the string `"false"` to `true` because any non-empty string is truthy. Replace with an explicit type check: `if (typeof notif_enabled !== 'boolean') return res.status(422).json({ error: 'notif_enabled must be a boolean' })`. The endpoint already receives JSON, so a well-behaved client always sends a native boolean.

**HRD-4 — Apply esc() to data-current attribute for notif_enabled**
As a developer, I want `data-current="${profile.notif_enabled}"` in `page.js` to pass through `esc()` like every other interpolated value, so the escaping pattern is consistent and future values cannot accidentally break it.

*Technical note:* No XSS risk exists today (the value is always `true` or `false`), but the omission breaks the consistent escaping convention used for all other dynamic attributes in the same file. Add `esc()` around the interpolation so a code reader does not have to reason about why this one attribute is different.

**HRD-5 — Add test for sharp failure path on corrupt image input**
As a developer, I want a test that exercises the `catch` block on `sharp(...).toBuffer()` in `POST /account/avatar`, so the error response for a corrupt image is verified and the branch cannot silently regress.

*Technical note:* The `catch` block that returns HTTP 500 `"Image processing failed"` is currently unreachable under the existing mock setup because `sharp` is not mocked to throw. Add a test case that mocks `sharp(...).toBuffer()` to reject with an error, and assert that the route returns 500 with the expected error body.

**HRD-6 — Remove S3 key from POST /account/avatar JSON response**
As a developer, I want the avatar upload response to omit the raw S3 key, so internal storage details are not unnecessarily disclosed to the client.

*Technical note:* `POST /account/avatar` currently returns `{ ok: true, avatarUrl: ..., key: newKey }`. The `key` field (raw S3 object key) is not needed by the client — the UI uses `avatarUrl` for the preview update. Remove `key` from the response object. Not exploitable (the bucket is private), but good practice to minimise information disclosure.

**HRD-7 — Rate-limit PATCH /account to prevent email enumeration**
As a developer, I want `PATCH /account` to be rate-limited so that an authenticated user cannot rapidly enumerate registered email addresses via the 409 conflict response.

*Technical note:* `PATCH /account` returns HTTP 409 `"Email already in use"` when the submitted email belongs to another account. Without a rate limit, an authenticated user can probe thousands of emails per minute. Apply the existing rate-limiter (or `express-rate-limit`) to this endpoint — a modest limit of ~10 requests per minute per user is sufficient. See `src/routes/account.js` for the endpoint and the existing limiter usage elsewhere in the codebase for the pattern to follow.

---

## ACC-4 Follow-up (PR #82)

The following items were identified as non-blocking observations during the tech-lead and QA review of PR #82 (`feat/acc-4-session-management`). All are low-priority cleanup or hardening tasks.

**HRD-8 — Extract session TTL to a shared constant**
As a developer, I want the 7-day session TTL defined in a single shared constant so that changing the cookie `maxAge` automatically keeps the "last seen" calculation in sync.

*Technical note:* `account.js` hardcodes `7 * 24 * 60 * 60 * 1000` for the "last seen" calculation (`expire - maxAge`). This duplicates the same value in `session.js`'s `cookie.maxAge`. Extract it to a shared constant (e.g. `SESSION_MAX_AGE_MS` exported from `src/session.js` or a new `src/constants.js`) and import it in both files. A TTL change in one place currently breaks the display silently.

**HRD-9 — Add CSRF 403 tests for session revoke endpoints**
As a developer, I want `account.test.js` to assert that `DELETE /account/sessions` and `DELETE /account/sessions/:sid` return 403 when the `X-CSRF-Token` header is absent, so removing the CSRF middleware from `app.js` cannot go undetected.

*Technical note:* The `makeApp` helper in `account.test.js` does not wire `csrfMiddleware`, so a missing CSRF token on the session revoke `DELETE` routes does not return 403 in the current test suite. Add two test cases — one for the bulk endpoint and one for the individual endpoint — that send the `DELETE` request without an `X-CSRF-Token` header and assert a 403 response. Wire the CSRF middleware in `makeApp` (or use a dedicated app instance) to make the assertion meaningful.

**HRD-10 — Unit-test parseUserAgent and relativeTime helpers**
As a developer, I want direct unit tests for the `parseUserAgent` and `relativeTime` private helpers in `account.js` so that missing branches are caught before integration.

*Technical note:* Both helpers are currently exercised only via integration tests, leaving several branches untested. Missing coverage includes: Edge on Windows, Mobile Safari on iPhone, Firefox on Linux, raw UA truncation fallback (UA string longer than 60 characters), `relativeTime` with a `null` or invalid input, and all singular vs plural forms (1 day vs 2 days, 1 month vs 2 months, 1 year vs 2 years). Export the helpers (or move them to a `src/utils/session-helpers.js` module) and add a dedicated unit test file covering each branch.

**HRD-11 — Add 500 error path test for individual session revoke**
As a developer, I want `DELETE /account/sessions/:sid` to have a `returns 500 when db.query rejects` test, matching the equivalent test that already exists for the bulk revoke endpoint.

*Technical note:* The bulk `DELETE /account/sessions` handler has a test asserting it returns 500 when `db.query` rejects. The individual `DELETE /account/sessions/:sid` handler lacks this test, creating an inconsistency in error-path coverage. Add a test case that makes `db.query` reject and asserts the route returns 500 with the expected error body (consistent with `wrapAsync` behaviour).

**HRD-12 — Mock express-rate-limit in account.test.js**
As a developer, I want `express-rate-limit` mocked in `account.test.js` so that `sessionRevokeLimiter`'s in-memory store cannot cause spurious 429 responses as the test suite grows.

*Technical note:* `sessionRevokeLimiter` uses an in-memory store that is not reset between tests. If the number of `DELETE` route test cases grows past 30, tests will start returning 429 instead of their expected status codes. Add `jest.mock('express-rate-limit', () => () => (req, res, next) => next())` at the top of `account.test.js`, matching the pattern already used by the avatar tests in the same file.
