# Account Page

**[DONE] ACC-1 — Role-aware identity card**
As a logged-in user, my account page shows an identity card adapted to my role (admin, editor, or viewer): a large avatar, a greeting, stats (uploads, albums, favourites, comments, recipes), a permission strip listing what I can and cannot do, and cards relevant to my role — so I can see everything about my account at a glance.

---

**[DONE] ACC-2 — Inline profile editing**
As a logged-in user, I can edit my name, email, language, theme, and notification preferences directly on my account page by clicking a value to make it editable in-place, so I can keep my profile current without navigating to a separate form.

**Acceptance criteria:**

1. On `GET /account`, each editable field (name, email, language, theme, notifications) is rendered as a static value with a visible edit affordance (pencil icon or underline cursor on hover).
2. Clicking a field value replaces it with an inline input (text input for name/email, `<select>` for language/theme, toggle for notifications). No page navigation occurs.
3. Pressing Enter or clicking a "Save" checkmark button beside the field submits a `PATCH /account` JSON request with the changed field only (e.g. `{ "name": "Alice" }`). The input is replaced by the updated static value on success (200 response).
4. Pressing Escape cancels the edit and restores the original value with no server call.
5. If the server returns an error (4xx/5xx), the input remains open with an inline error message beneath it; the original value is not restored.
6. Name validation: 1–100 characters, non-empty after trimming. Submitting an empty or whitespace-only name returns HTTP 422 with `{ "error": "Name is required" }`.
7. Email validation: must match the basic RFC-5322 pattern (contains `@` and a `.`-separated domain). Submitting a malformed email returns HTTP 422 with `{ "error": "Invalid email address" }`. Submitting an email already in use by another user returns HTTP 409 with `{ "error": "Email already in use" }`.
8. Language options: `en` (English) and `fr` (French). Default: `en`. The select shows the current value on load.
9. Theme options: `light` and `dark`. Default: `light`. The select shows the current value on load.
10. Notifications toggle: boolean. Default: `true` (enabled). The toggle reflects the current stored value on load.
11. After a successful name change, the name shown in the account page header, the nav avatar tooltip, and — on the **next full page load** — the session-driven nav avatar initial all reflect the new name. The server must write `req.session.name` inside the same `PATCH /account` handler before responding.
12. `PATCH /account` is protected by `requireAuth`. Any request without a valid session returns HTTP 401.
13. `PATCH /account` validates CSRF: requests without a valid `X-CSRF-Token` header return HTTP 403.
14. Only the fields included in the request body are updated; omitted fields are unchanged.
15. Concurrent edits: if the user opens two tabs and saves from both, the last write wins (no optimistic-locking required).
16. On mobile (viewport < 600 px), clicking a value opens the same inline input; tap targets are at minimum 44×44 px; the save/cancel controls are reachable without horizontal scroll.

**Error states:**
- Network timeout or 5xx: show "Could not save — try again" beneath the field; input stays open.
- 422: show the `error` message from the response body beneath the field.
- 409 (email conflict): show "That email is already in use" beneath the field.

**Edge cases:**
- Name exactly 100 characters: accepted.
- Name 101 characters: rejected with 422.
- Email unchanged (user edits then saves the same value): accepted silently (no conflict check needed against own email).
- All five fields edited in rapid succession before any saves complete: each `PATCH` is independent; responses can arrive out of order; each field's UI updates on its own response.

**Access control:** Any logged-in user (viewer, editor, admin) can edit their own profile. No user can edit another user's profile via this endpoint (the endpoint always operates on `req.session.userId`).

**Test data:** Create users with names at 1-char, 50-char, 100-char, 101-char lengths. Create two users to test email conflict. Test all language/theme/notifications combinations.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). All interactions must be keyboard-accessible: Tab to the edit icon, Enter to activate, Tab to input, Enter to save, Escape to cancel.

> **Technical notes:**
>
> **Schema — `user_prefs` table (migration `v11.sql`):**
> Add a new `user_prefs` table rather than columns on `users`, to keep the core auth table clean and avoid sparse NULLs:
> ```sql
> CREATE TABLE IF NOT EXISTS user_prefs (
>   user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
>   language    VARCHAR(10)  NOT NULL DEFAULT 'en',
>   theme       VARCHAR(10)  NOT NULL DEFAULT 'light',
>   notif_enabled BOOLEAN    NOT NULL DEFAULT TRUE
> );
> ```
> On first `PATCH /account` for prefs fields, use `INSERT ... ON CONFLICT (user_id) DO UPDATE` (upsert). `GET /account` LEFT JOINs `user_prefs` and falls back to defaults when no row exists.
>
> **`name` and `email` stay in the `users` table** — no `display_name` column needed; the existing `name` column is the editable display name.
>
> **API endpoint:** `PATCH /account` in `src/routes/account.js`. Accepts `application/json`. Returns `200 { "ok": true }` on success, or an error object. Only updates columns/rows for the fields present in the body.
>
> **Session sync:** After updating `name` in the DB, immediately set `req.session.name = newName` in the handler (before `res.json`). Express-session will persist this automatically.
>
> **CSRF:** The existing CSRF middleware already injects `X-CSRF-Token` into `window.fetch` for non-GET requests (see `src/layout/page.js`). No extra work needed client-side.
>
> **Out of scope:** Changing password (handled by `GET/POST /account/password`). Changing role (admin-only, handled by `PATCH /admin/users/:id`). Deleting the account (handled by ACC-5). Avatar (handled by ACC-3). Language/theme preferences are stored but not yet applied to the UI rendering (that is a separate DS story).

---

**[DONE] ACC-3 — Avatar upload and removal**
As a logged-in user, I can upload a personal avatar photo from my account page and remove it to revert to my initial letter, so my profile always shows a recognisable image or a clean fallback.

**Acceptance criteria:**

1. On `GET /account`, the avatar circle shows either the user's avatar image (if one is stored) or the first letter of their name in uppercase (current behaviour). The avatar image is rendered as a circular crop.
2. A "change" button (or icon, aria-label: "Change avatar") is visible below or overlaid on the avatar circle at all times when a user is logged in.
3. Clicking "change" opens a native file picker (`<input type="file" accept="image/jpeg,image/png,image/webp">`). No drag-and-drop required.
4. After the user selects a file, the client sends a `POST /account/avatar` multipart/form-data request with the field name `avatar`. The avatar circle updates to the new image on success (200 response) without a full page reload.
5. File constraints enforced server-side:
   - Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`. Any other type returns HTTP 415 with `{ "error": "Unsupported file type. Use JPEG, PNG, or WebP." }`.
   - Maximum file size: 5 MB. Exceeding this returns HTTP 413 with `{ "error": "File too large. Maximum 5 MB." }`.
6. The server crops and resizes the image to 256×256 pixels (square) using `sharp` before uploading to S3. The crop strategy is `cover` (fill the square, centring the image). The stored file is always JPEG regardless of the input format.
7. S3 key convention: `{uuid}.jpg` — a new UUID per upload, no prefix, no userId subdirectory. Uses `forcePathStyle: true` (same as photos).
8. The new `avatar_s3_key` is stored in the `users` table (see technical notes). If the user already had an avatar, the old S3 object is deleted after the new one is confirmed uploaded.
9. A "remove avatar" link (aria-label: "Remove avatar") is shown beside or below the avatar only when an avatar image is currently set. Clicking it sends `DELETE /account/avatar`. The avatar reverts to the initial-letter circle immediately on success (200). The S3 object is deleted server-side.
10. After a successful upload, the nav avatar circle in the top-right of every page shows the actual avatar image (as a circular `<img>`) on the **next full page load**. The current session's nav avatar is not updated in-place (acceptable for V1 — full page navigation refreshes it).
11. `POST /account/avatar` and `DELETE /account/avatar` are protected by `requireAuth`. Unauthenticated requests return HTTP 401.
12. `POST /account/avatar` validates CSRF via the `X-CSRF-Token` header. Invalid token returns HTTP 403.
13. If the S3 upload fails, the DB is not updated and the existing avatar (or absence of one) is unchanged. The client receives HTTP 500 with `{ "error": "Upload failed — please try again." }`.
14. If the S3 delete of the old object fails after a successful new upload, the failure is logged server-side but does not affect the user response (fire-and-forget cleanup, same pattern as photo deletion in `router.post('/account/delete')`).
15. On mobile (viewport < 600 px), the "change" button tap target is at minimum 44×44 px. File picker opens the native camera/library chooser on iOS and Android.

**Error states:**
- File too large (> 5 MB): show "File too large. Maximum 5 MB." below the avatar circle. Picker closes, no upload starts.
- Unsupported file type: show "Use a JPEG, PNG, or WebP image." below the avatar circle.
- S3 upload failure / 5xx: show "Upload failed — try again." below the avatar circle. Current avatar unchanged.
- Network timeout: show "Could not reach server — try again." Current avatar unchanged.

**Edge cases:**
- User uploads a 1×1 pixel image: accepted, resized to 256×256 with `cover` strategy.
- User uploads a very wide image (e.g. 4000×100 px): accepted, cropped to 256×256.
- User has no avatar and clicks "remove": the "remove" link is not shown (criterion 9), so this state is unreachable via the UI. The `DELETE /account/avatar` endpoint still returns 200 gracefully if called with no avatar stored.
- User uploads two avatars in quick succession: the second upload's S3 key overwrites the first in the DB; both old objects are queued for deletion.
- User with name "" (empty name, edge case from user creation): fallback initial is "?" (existing behaviour, see `account.js` line 217).

**Access control:** Any logged-in user (viewer, editor, admin) can upload or remove their own avatar. The endpoint always operates on `req.session.userId`; no user can set another user's avatar.

**Test data:** Prepare test images: 1×1 JPEG, 4000×4000 JPEG, 4000×100 PNG, 5.1 MB JPEG (too large), a `.gif` file (wrong type), a valid WebP. Use a user account with no avatar and one with an existing avatar.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The `<input type="file">` approach requires no special JS library and works natively on all targets.

> **Technical notes:**
>
> **Schema — add `avatar_s3_key` to `users` (migration `v11.sql`, same file as ACC-2 prefs):**
> ```sql
> ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_s3_key TEXT;
> ```
>
> **S3 upload flow:** Use `sharp(buffer).resize(256, 256, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()`, then call the existing `uploadPhoto(key, buffer, 'image/jpeg')` from `src/storage.js`. New key = `${uuidv4()}.jpg`.
>
> **Old avatar cleanup:** After confirming the DB update, call `deletePhoto(oldKey).catch(err => console.warn(...))` — identical fire-and-forget pattern used in `router.post('/account/delete')`.
>
> **Nav avatar rendering** (`src/layout/page.js`): When `session.avatarS3Key` is set, replace the `<span class="nav-avatar">` letter with `<img src="/account/avatar-thumb" class="nav-avatar-img" alt="">` (served via a signed S3 URL or a redirect endpoint). Simplest approach: add a `GET /account/avatar` endpoint that redirects to a presigned S3 URL (same pattern as photo serving). Alternatively, store the public S3 URL directly if the bucket is configured for avatar objects to be public-read — but prefer presigned URLs to keep the bucket private.
>
> **Session enrichment:** After uploading or removing the avatar, set `req.session.avatarS3Key = newKey` (or `null`) so the next page render picks it up without a DB round-trip.
>
> **`multer` configuration:** Use `memoryStorage()` (already used for photo uploads in `uploadHelpers.js`). Set `limits: { fileSize: 5 * 1024 * 1024 }` on the multer instance for this route specifically.
>
> **`v11.sql` combines ACC-2 and ACC-3 schema changes** (one migration file):
> ```sql
> -- ACC-2: user preferences
> CREATE TABLE IF NOT EXISTS user_prefs (
>   user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
>   language      VARCHAR(10) NOT NULL DEFAULT 'en',
>   theme         VARCHAR(10) NOT NULL DEFAULT 'light',
>   notif_enabled BOOLEAN     NOT NULL DEFAULT TRUE
> );
>
> -- ACC-3: avatar
> ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_s3_key TEXT;
> ```
>
> **Out of scope:** Cropping UI in the browser (server-side `cover` crop only). Animated GIF avatars. Avatar CDN or cache-control headers. Applying the `theme` preference to rendered pages (separate DS story). Avatar display on other users' public profiles (no public profiles exist). Admin setting another user's avatar.

---

**[DONE] ACC-4 — Session management**
As a logged-in user, I can see the list of my active sessions (browser, device, last seen) and revoke any of them individually or all others at once — so I can sign out of forgotten devices.

**Acceptance criteria:**

1. On `GET /account`, a "Sessions" section appears below the avatar section and above the Danger Zone. It lists every row in the `session` table where `sess->>'userId' = req.session.userId` and `expire > NOW()`.
2. Each session row displays:
   - **Browser / OS label** — derived from the stored `userAgent` string (e.g. "Chrome on macOS", "Safari on iPhone"). If no `userAgent` is stored (legacy session), show "Unknown device".
   - **IP address** — stored at login time (e.g. "192.168.1.42"). If absent, show "Unknown location".
   - **Last seen** — the `expire` timestamp minus the session `maxAge` (7 days) gives the creation/last-refresh time. Display as a relative time (e.g. "3 hours ago", "2 days ago"). If the value cannot be computed, show the raw `expire` date.
   - **"Current" badge** — the row for `req.sessionID` is visually marked "(current session)" and its revoke button is hidden (the current session cannot be self-revoked from this list).
3. A "Revoke" button on each non-current session row sends `DELETE /account/sessions/:sid`. On success (200), the row is removed from the list without a full page reload.
4. A "Sign out all other devices" button at the bottom of the section sends `DELETE /account/sessions` (bulk). On success (200), all non-current session rows are removed from the list without a full page reload. If there are no other sessions, the button is shown but clicking it is a no-op (returns 200, no rows change).
5. `DELETE /account/sessions/:sid` — the server deletes the row from the `session` table only if `sess->>'userId' = req.session.userId`. Attempting to revoke a session belonging to another user returns HTTP 403. Attempting to revoke the caller's own current session (matching `req.sessionID`) returns HTTP 403. Attempting to revoke a `sid` that does not exist or has already expired returns HTTP 404.
6. `DELETE /account/sessions` (bulk) — the server deletes all rows in the `session` table where `sess->>'userId' = req.session.userId` AND `sid != req.sessionID`. Returns HTTP 200 with `{ "revoked": N }` where N is the count of deleted rows. Returns 200 with `{ "revoked": 0 }` if there were no other sessions.
7. Both endpoints are protected by `requireAuth`. Unauthenticated requests return HTTP 401.
8. Both endpoints validate CSRF via the `X-CSRF-Token` header. Invalid or missing token returns HTTP 403.
9. Both endpoints use `wrapAsync` (no unhandled-promise crashes).
10. At login time (`POST /login`), the handler enriches the session with two new fields before saving:
    - `req.session.userAgent = req.headers['user-agent'] || null`
    - `req.session.loginIp = req.ip || null`
    These fields are persisted in the `sess` JSON blob by `connect-pg-simple` on the first save.
11. A rate limiter (`express-rate-limit`) protects the revoke endpoints: max 30 requests per 15 minutes per IP. Exceeding returns HTTP 429 with `{ "error": "Too many requests — try again later." }`.
12. If the sessions list is empty (only the current session exists), the list area shows the single current-session row with the "(current)" badge and no Revoke button. The "Sign out all other devices" button is still visible but grayed out (disabled attribute) with label "No other active sessions".
13. The sessions list is rendered server-side on the initial `GET /account` page load (no separate `GET /account/sessions` API call required). The client only calls the API for revoke actions.
14. On mobile (viewport < 600 px), session rows stack vertically; the Revoke button appears below the session metadata as a full-width button with a minimum tap target of 44×44 px. The "Sign out all other devices" button is full-width.

**Error states:**
- Network timeout or 5xx on revoke: show "Could not revoke session — try again." inline below the session row. The row is not removed.
- 403 on individual revoke (e.g. attempting to revoke current session via direct API call): show "You cannot revoke your current session from this page."
- 404 on individual revoke (session already expired or already revoked): remove the row silently (treat as success — the goal is achieved).
- 429 (rate limit): show "Too many requests — wait a moment before trying again." beneath the sessions section.
- Network timeout or 5xx on bulk revoke: show "Could not sign out other devices — try again." beneath the button. No rows are removed.

**Edge cases:**
- User has only one session (current): list shows one row, "Sign out all other devices" is disabled. No revoke buttons shown.
- User has exactly 2 sessions: after revoking the non-current one, the list shows only the current session row and the bulk button becomes disabled.
- A session expires between page load and revoke click: `DELETE /account/sessions/:sid` returns 404; the UI removes the row silently (see error states).
- Two tabs open simultaneously: if tab A bulk-revokes and tab B then attempts an individual revoke, tab B gets 404 and removes the row silently.
- Legacy sessions (created before `userAgent`/`loginIp` enrichment): display "Unknown device" and "Unknown location" per criterion 2.
- `req.ip` behind a reverse proxy: the Express app must have `app.set('trust proxy', 1)` set so `req.ip` resolves to the client IP, not `127.0.0.1`. If not set, `loginIp` will show `::1`/`127.0.0.1` — acceptable for V1 (document as a known limitation).

**Access control:**
- Any logged-in user (viewer, editor, admin) can view and revoke their own sessions.
- No user can view or revoke another user's sessions; the endpoints enforce ownership via `sess->>'userId' = req.session.userId`.
- Admin users have no special privileges on this endpoint (no "revoke any user's sessions" capability in this story).

**Test data:**
- Create a test user and log in from two different browsers (or use separate private/incognito windows) to generate at least two active sessions.
- Use a third browser to generate a third session, then close it without logging out (to simulate an abandoned session that is still within the 7-day window).
- Confirm that `SELECT * FROM session WHERE sess->>'userId' = '<id>'` shows the correct rows before and after revoke.
- Test a user with only one active session (the current one).
- To test legacy sessions: manually insert a `session` row with a `sess` blob that lacks `userAgent` and `loginIp` fields.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The revoke and bulk-revoke actions use `fetch` + `X-CSRF-Token` (same pattern as ACC-2/3); no framework required.

> **Technical notes:**
>
> **No schema migration required.** The `session` table is created by `connect-pg-simple` (migration `v10.sql`). The `sess` JSON blob already accepts arbitrary keys — adding `userAgent` and `loginIp` at login time requires no `ALTER TABLE`.
>
> **Reading sessions from the DB:** Query directly:
> ```sql
> SELECT sid, sess, expire
> FROM session
> WHERE sess->>'userId' = $1
>   AND expire > NOW()
> ORDER BY expire DESC;
> ```
> `$1` is `String(req.session.userId)` — `sess` stores userId as a string in JSON.
>
> **Deriving "last seen":** `expire - INTERVAL '7 days'` gives the approximate session creation/last-activity time (because `rolling: true` resets `expire` to `NOW() + 7d` on every request). Compute this in JS: `new Date(expire.getTime() - 7 * 24 * 60 * 60 * 1000)`.
>
> **Parsing user agent:** Use a lightweight inline parser or a small utility (`useragent` or `ua-parser-js`). If no new package is added, a regex covering the most common browsers is acceptable: detect Chrome, Firefox, Safari, Edge by string matching `req.headers['user-agent']`. Fallback: show the raw user-agent string truncated to 60 characters.
>
> **Individual revoke (`DELETE /account/sessions/:sid`):**
> ```sql
> DELETE FROM session
> WHERE sid = $1
>   AND sess->>'userId' = $2
>   AND sid != $3;
> -- $1 = req.params.sid, $2 = String(req.session.userId), $3 = req.sessionID
> ```
> If `rowCount === 0`, return 404 (not found or forbidden ownership — do not distinguish to avoid enumeration).
>
> **Bulk revoke (`DELETE /account/sessions`):**
> ```sql
> DELETE FROM session
> WHERE sess->>'userId' = $1
>   AND sid != $2;
> -- $1 = String(req.session.userId), $2 = req.sessionID
> ```
> Return `{ "revoked": result.rowCount }`.
>
> **Login enrichment** — add to the existing `POST /login` success handler in `src/routes/auth.js` (or wherever login sets `req.session.userId`):
> ```js
> req.session.userAgent = req.headers['user-agent'] || null;
> req.session.loginIp   = req.ip || null;
> ```
> These lines go before the `req.session.save()` call (or before `res.redirect`).
>
> **`trust proxy`:** Add `app.set('trust proxy', 1)` in `src/app.js` if not already present, so `req.ip` reflects the real client IP when behind Caddy.
>
> **Rate limiting:** Reuse the `express-rate-limit` pattern from `avatarLimiter` in `account.js`. Create a `sessionRevokeLimiter` with `{ windowMs: 15 * 60 * 1000, max: 30 }` and apply it to both `DELETE /account/sessions` and `DELETE /account/sessions/:sid`.
>
> **Out of scope:** Showing the geographic location from IP (no GeoIP lookup). Showing all sessions to admins (no admin session overview). Session device icons. Forcing re-authentication before revoking (not required for V1). WebSocket push when another tab's session is revoked remotely.

---

**[DONE] ACC-5 — Danger zone**
As a logged-in user, I can delete my own account from the danger zone with a two-step confirmation (typed username required) — so the action cannot be done by accident.
