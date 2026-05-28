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

---

## Account Page Design Alignment (DS-ACC)

Gap analysis performed 2026-05-28 against:
- Design handoff: `sitephoto-design/design_handoff_user_personal_page/README.md`
- Current implementation: `src/routes/account.js` (`renderAccountPage` function) + `public/style.css` (lines 1797–1953)

### Summary of gaps

| Area | Current state | Design requires |
|---|---|---|
| Page layout | Single flex-column, max-width 800px | Two-column grid (1.3fr / 1fr), 24px gap, 32px side gutters |
| Header block | Flex row: 64px avatar + name + role badge + 3-stat strip | 3-column: 130px avatar circle with "↻ change" tab + greeting/badge/email + 5-KPI stats strip with vertical rules |
| Stats strip | 3 KPIs (uploads, albums, recipes), Caveat 1.5rem, no vertical rules | 5 KPIs (uploads, albums, favourites, comments, recipes), Caveat 30px, vertical 1.5px ink rules between tiles, `—` muted variant for viewer N/A stats |
| Permission strip | Generic card titled "Permissions" with flat pills; no washi-tape, no kicker copy, no role-aware cant-pills with strikethrough | Full-width card: left kicker "YOUR RIGHTS · ROLE ·" + right flex-wrap of green can-pills (✓) and strikethrough can't-pills (✗) with washi-tape decoration |
| Role badge | `.role-badge`, mono 0.65rem, uppercase, 1.5px ink border, admin gets `var(--accent)` background; no glyph prefix, no rotation, no role colours | Mono 11px / 700, letter-spacing 2.5px, rotated -1.5°; role-specific border + bg colours (admin red, editor blue, viewer green); glyph prefixes: ★ admin, ✎ editor, ◎ viewer |
| Avatar | 64px circle in header flex row; "↻ change" is an SVG icon button positioned bottom-right | 130px circle, 2.5px solid ink border, diagonal hatch bg, Caveat 76px initial; "↻ change" is a hanging tab rotated -2° clipped to bottom edge |
| Left column — admin/editor | Details section + "Quick links" list | Details card + Recent uploads mosaic (6-col, first cell 2×2 span) + Tag recipes rows |
| Left column — viewer | Same as above (no role differentiation) | Details card + Favourites grid (8-col tighter) + Activity log (last 14 days) |
| Right column — admin | Admin tools hidden; just sessions + quick links + danger zone | Albums grid (2×2, 4 tiles + "N more →") + Admin tools tile grid (5 tools) + Sessions + Danger zone |
| Right column — editor | No shared-with section | Albums grid + Shared-with list (people + revoke) + Sessions + Danger zone |
| Right column — viewer | No role-specific cards | Tag recipes (prominent, "YOUR THING" badge) + "What you can't do here" card + Sessions + Danger zone |
| Design tokens | Missing `--paper-3`, `--accent-2`, `--accent-3` from `:root` | All 3 tokens must be declared |
| Card chrome | Cards use `border: 1.5px solid var(--ink)` and `border-radius` varies | All account cards: `border-radius: 0` (square), `1.5px solid var(--ink)`, optional `.d1-tape` washi-tape decoration |
| Page background | Solid `var(--paper)` | Double dot-pattern to simulate dotted notebook paper |
| Nav — viewer | Viewer sees same nav as editor (no "Photos" link but no READ-ONLY label) | Viewer nav replaces `+ upload` button with `READ-ONLY` mono label |
| Viewer stats | Uploads/albums stats show real counts (accessible photos/albums) | Uploads and albums stats show `—` (muted, `var(--ink-faint)`) for viewer |
| Favourites/Comments stats | No favourites or comments stats anywhere | Stats strip needs `favourites` and `comments` counts (requires DB tables — see notes) |
| Quick links section | Present as a separate card with `<a>` buttons | Replaced by contextual in-column navigation (Admin tools tile grid, Albums grid, etc.) — "Quick links" card removed |

---

**DS-ACC-1 — Implement two-column layout and card shell**
As a logged-in user, I can view my account page in a two-column layout that matches the paper aesthetic, so all sections are organised and visually consistent with the rest of the site.

**Acceptance criteria:**

1. `GET /account` renders inside a `.acc-body` wrapper that uses `display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; padding: 18px 32px 22px; max-width: none` — replacing the current `.acc-wrap` single-column flex layout. The outer max-width constraint is removed; the 32px side gutters are applied via `padding`.
2. The left column has class `.acc-col-left`; the right column has class `.acc-col-right`. Each column is a vertical stack of cards with `display: flex; flex-direction: column; gap: 16px`.
3. Every card on the account page uses CSS class `.acc-card-block` with: `border: 1.5px solid var(--ink); border-radius: 0; background: var(--paper); padding: 16px 18px`. No `box-shadow`. No `border-radius` other than 0.
4. Card title (`h3` inside `.acc-card-block`) uses class `.acc-card-title` with: `font-family: 'Caveat', cursive; font-size: 26px; font-weight: 700; margin: 0 0 12px`. Optional mono count appears after the title text. Optional "N more →" link uses class `.acc-card-more` aligned to the right of the title row, styled in `var(--accent)`, Kalam 13px.
5. Cards that have the washi-tape decoration use a `.d1-tape` pseudo-element: `56×12px rectangle; background: rgba(217,169,99,0.55); border: 1px dashed rgba(217,169,99,0.9); border-radius: 2px; position: absolute; top: -6px; left: 12px; transform: rotate(-2deg)`. The card must have `position: relative; overflow: visible`. Tape color variants: `.d1-tape--cool` (blue: `rgba(99,149,217,0.55)`), `.d1-tape--green` (sage: `rgba(99,180,130,0.55)`), `.d1-tape--red` (rose: `rgba(217,99,99,0.55)`).
6. The header block (avatar + greeting + stats) spans the full width above the two-column body. It uses class `.acc-header` with `display: grid; grid-template-columns: auto 1fr auto; gap: 24px; align-items: start; padding: 18px 32px 0; margin-bottom: 16px`.
7. The right column always contains the Sessions card and Danger Zone card as its final two items (in that order), regardless of role. Other right-column cards appear above them.
8. On viewport ≥ 900px: two-column layout applies. On viewport < 900px: single-column stacked layout — left-column cards appear first, then right-column cards. Breakpoint lives in a `@media (max-width: 900px)` rule that sets `.acc-body { grid-template-columns: 1fr }`.
9. The page background uses the dotted notebook paper texture:
   ```css
   background-image:
     radial-gradient(rgba(26,24,20,0.04) 1px, transparent 1px),
     radial-gradient(rgba(26,24,20,0.03) 1px, transparent 1px);
   background-size: 22px 22px, 11px 11px;
   background-position: 0 0, 6px 6px;
   ```
   Applied to `body` (or the `.acc-page-bg` wrapper) only on the `/account` route to avoid affecting other pages.
10. The existing `.acc-section` / `.acc-section-h` / `.acc-section-b` classes are deprecated on this page; all cards switch to `.acc-card-block` + `.acc-card-title`. The old classes remain in CSS for the `/account/delete` and `/account/password` sub-pages which still use them.
11. The "Quick links" section (`buildQuickLinks`) is removed from `renderAccountPage`. Its links are replaced by contextual navigation inside role-specific cards (Admin tools, Albums grid, etc.).

**Edge cases:**
- User with no albums/uploads: columns still render; cards show empty-state copy (see role-specific card stories for exact copy).
- Viewport exactly 900px: mobile layout applies (breakpoint is `max-width: 900px`).
- Account page accessed on very narrow viewport (320px): cards fill full width, no horizontal scroll.

**Access control:** All logged-in roles (admin, editor, viewer) see this two-column layout; the specific cards that appear in each column are role-gated (see DS-ACC-4 and DS-ACC-5).

**Test data:** Test with admin, editor, and viewer accounts. Test at viewports 320px, 600px, 899px, 900px, 1280px, 1440px.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). CSS Grid is the layout mechanism.

> **Technical notes:**
>
> Modify `renderAccountPage` in `src/routes/account.js`. The function currently builds a single `.acc-wrap` flex column. Refactor it to output:
> ```html
> <div class="acc-page-bg">
>   <div class="acc-header">...</div>
>   <div class="acc-body">
>     <div class="acc-col-left">...</div>
>     <div class="acc-col-right">...</div>
>   </div>
> </div>
> ```
> Add the new CSS classes to `public/style.css` in the `/* ── Account page ── */` section. Keep old `.acc-section` classes for the `/account/delete` and `/account/password` pages which are separate routes.

---

**DS-ACC-2 — Header block: 130px avatar, greeting, and 5-KPI stats strip**
As a logged-in user, I can see a large avatar, my name with role badge, and a strip of 5 key stats at the top of my account page, so I get a full identity summary at a glance.

**Acceptance criteria:**

1. The header block uses a 3-column grid: column 1 = avatar circle, column 2 = identity text, column 3 = stats strip. Each column is `align-self: start`.
2. The avatar circle is 130×130px (up from current 64px). CSS: `width: 130px; height: 130px; border: 2.5px solid var(--ink); border-radius: 50%; background: var(--paper-2); flex-shrink: 0; position: relative`. Background uses diagonal hatch pattern: `repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(26,24,20,0.06) 4px, rgba(26,24,20,0.06) 5px)` over `var(--paper-2)`.
3. The initial letter inside the avatar uses class `.acc-avatar-initial`: `font-family: 'Caveat', cursive; font-size: 76px; font-weight: 700; color: var(--ink); line-height: 1`. When an avatar image is set, the `<img>` replaces the initial letter; the `<img>` has `object-fit: cover; width: 100%; height: 100%; border-radius: 50%`.
4. The "↻ change" tab is a `<button>` with class `.acc-avatar-tab`: positioned absolute at `bottom: -14px; left: 50%; transform: translateX(-50%) rotate(-2deg)`. Styled: `background: var(--paper); border: 1.5px solid var(--ink); border-radius: 0; font-family: 'Caveat', cursive; font-size: 13px; padding: 2px 10px; cursor: pointer; white-space: nowrap`. Text: `↻ change`. On mobile the tap target is extended via `::before { content: ''; position: absolute; inset: -8px }` (min 44px total).
5. The identity text column contains (top to bottom): greeting `<h2>` ("Hello, [name]"), role badge `<span>`, email `<p>`. The `<h2>` uses `font-family: 'Caveat', cursive; font-size: 32px; font-weight: 700; margin: 0 0 6px`. Email uses `font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); margin: 6px 0 0`.
6. The role badge (class `.acc-role-badge`) has: `font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; transform: rotate(-1.5deg); display: inline-block; padding: 2px 8px`. Role-specific styles:
   - Admin (`.acc-role-badge--admin`): `border: 1.5px solid oklch(55% 0.20 25); background: oklch(96% 0.02 25); color: oklch(55% 0.20 25)`. Text: `★ ADMIN`.
   - Editor (`.acc-role-badge--editor`): `border: 1.5px solid var(--accent-2); background: oklch(96% 0.02 220); color: var(--accent-2)`. Text: `✎ EDITOR`.
   - Viewer (`.acc-role-badge--viewer`): `border: 1.5px solid var(--accent-3); background: oklch(96% 0.02 140); color: var(--accent-3)`. Text: `◎ VIEWER`.
7. The stats strip (column 3) contains 5 tiles separated by thin vertical rules. Tiles from left to right: **uploads · albums · favourites · comments · recipes**. Each tile:
   - Class `.acc-stat-tile`: `text-align: right; padding: 0 12px; position: relative`.
   - Number: class `.acc-stat-num`, `font-family: 'Caveat', cursive; font-size: 30px; font-weight: 700; line-height: 1`.
   - Label: class `.acc-stat-label`, `font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink-faint)`.
   - Vertical separator: `border-left: 1.5px solid var(--ink)` on all tiles except the first.
8. Viewer muted stats: for viewer role, the **uploads** and **albums** stat tiles show `—` (em-dash) as the number and use `color: var(--ink-faint)` on the number. These tiles get class `.acc-stat-tile--muted`. The `stats.uploads` and `stats.albums` values are not fetched/displayed for viewer on the stats strip (the existing DB query that counts accessible photos/albums is removed from this context; those numbers appear nowhere on the viewer's stats strip).
9. The 2 new stats KPIs (favourites, comments) require new DB queries in `GET /account`. Until the `photo_likes` and `comments` tables exist, the `favourites` and `comments` counts are fetched as `0` with a `/* TODO: DS-ACC-2 — favourites/comments tables not yet implemented */` comment. The story is not blocked on those tables existing.
10. The existing `.acc-stats` / `.acc-stat-n` / `.acc-stat-l` classes are replaced by the new `.acc-stat-tile` / `.acc-stat-num` / `.acc-stat-label` classes on the account page only.
11. The greeting `<h2>` is the user's display name. After an inline name edit (ACC-2), `document.querySelector('.acc-greeting-name')` is updated in the same JS handler that already updates `.acc-name`.

**Edge cases:**
- User with 0 for all stats: show `0` (not `—`) for admin/editor; show `—` for viewer uploads/albums, `0` for viewer favourites/comments/recipes.
- Name with 1 character: initial letter renders correctly at 76px without clipping.
- Very long name (100 chars): heading does not overflow the header grid; `overflow-wrap: break-word` on the `<h2>`.
- Very long email address: truncate with `text-overflow: ellipsis; overflow: hidden; max-width: 240px` on the email `<p>`.

**Access control:** All roles see the header. Viewer stats strip shows `—` for uploads/albums (not zero — the semantic difference matters: `—` means "not applicable", `0` means "zero of something you can have").

**Test data:** Create accounts for each role. For admin/editor: accounts with 0 uploads, 1 upload, 50 uploads. For viewer: account with shared albums. Verify the `—` displays on viewer row.

**Browser/device support:** Desktop + mobile. On viewport < 900px, the 3-column header collapses: avatar and identity text stack vertically (column 1 + 2 merge to full width), stats strip moves below them as a horizontal flex row.

> **Technical notes:**
>
> Modify `renderAccountPage` in `src/routes/account.js`. The identity card currently outputs `.acc-card` / `.acc-avatar` / `.acc-name` / `.acc-stats`. Replace the header rendering with the new 3-column header.
>
> New design tokens to add to `public/style.css` `:root` (required for DS-ACC-2 role badge colors):
> ```css
> --accent-2:  oklch(62% 0.14 220);  /* cool blue — editor */
> --accent-3:  oklch(64% 0.13 140);  /* sage green — viewer */
> --paper-3:   #e3ddcb;              /* used in some card backgrounds */
> ```
>
> Stats queries to add in `Promise.all` inside `GET /account` handler:
> ```js
> // [N] favourites count — placeholder until photo_likes table exists
> Promise.resolve({ rows: [{ n: 0 }] }),  // TODO: DS-ACC-2
> // [N] comments count — placeholder until comments table exists
> Promise.resolve({ rows: [{ n: 0 }] }),  // TODO: DS-ACC-2
> ```
>
> The existing `.acc-avatar` 64px circle CSS (line 1799 in `style.css`) is superseded. Keep it for the nav avatar fallback but add the new `.acc-avatar-hero` class at 130px for the header.
>
> The `.acc-avatar-tab` replaces the current `#js-avatar-change` SVG icon button. The JS `avatarChange.addEventListener('click', ...)` handler remains unchanged; only the element's class and HTML change.

---

**DS-ACC-3 — Permission strip with role-aware can/can't pills**
As a logged-in user, I can see a full-width permission strip below the header that shows exactly what my role allows and forbids, so I understand my access rights at a glance without reading documentation.

**Acceptance criteria:**

1. The permission strip renders as a full-width card (class `.acc-perms-strip`) spanning across both body columns. It sits between the header block and the two-column body. CSS: `border: 1.5px solid var(--ink); border-radius: 0; background: var(--paper); padding: 10px 14px; display: flex; align-items: flex-start; gap: 16px; position: relative; overflow: visible; margin: 0 32px 16px`.
2. The washi-tape decoration appears on the permission strip using `.d1-tape` (same pseudo-element spec as DS-ACC-1 criterion 5). The tape appears at `top: -6px; left: 12px` and uses the default ochre color.
3. The left kicker uses class `.acc-perms-kicker`: `font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink-faint); white-space: nowrap; padding-top: 2px`. Text content (role-aware):
   - Admin: `YOUR RIGHTS · ADMIN ·`
   - Editor: `YOUR RIGHTS · EDITOR ·`
   - Viewer: `YOUR RIGHTS · VIEWER ·`
4. The right section is a flex-wrap row of pill chips (class `.acc-perms-pills`): `display: flex; flex-wrap: wrap; gap: 6px; flex: 1`.
5. Can-pill (class `.acc-pill-can`): `border: 1.5px solid var(--accent-3); background: oklch(96% 0.02 140); color: var(--ink); border-radius: 999px; font-family: 'Kalam', cursive; font-size: 12px; padding: 2px 10px; display: inline-flex; align-items: center; gap: 4px`. Prefix glyph: `✓`.
6. Can't-pill (class `.acc-pill-cant`): `border: 1.5px solid var(--ink-faint); background: transparent; color: var(--ink-faint); border-radius: 999px; font-family: 'Kalam', cursive; font-size: 12px; padding: 2px 10px; display: inline-flex; align-items: center; gap: 4px; text-decoration: line-through`. Prefix glyph: `✗`.
7. Permission sets per role (all strings exact):

   **Admin** can-pills: `✓ view photos`, `✓ upload photos`, `✓ manage own albums`, `✓ share albums`, `✓ tag photos`, `✓ make tag recipes`, `✓ manage all tags`, `✓ manage users`, `✓ access AI tools`
   Admin has no can't-pills.

   **Editor** can-pills: `✓ view photos`, `✓ upload photos`, `✓ manage own albums`, `✓ share albums`, `✓ tag photos`, `✓ make tag recipes`
   Editor can't-pills: `✗ manage all tags`, `✗ manage users`, `✗ access AI tools`

   **Viewer** can-pills: `✓ view photos`, `✓ favourite photos`, `✓ comment on photos`, `✓ tag photos`, `✓ make tag recipes`
   Viewer can't-pills: `✗ upload photos`, `✗ create albums`, `✗ share albums`, `✗ manage users`

8. The existing `buildPermsPills(role)` function in `account.js` is replaced. The current `permsSection` block (titled "Permissions", class `.acc-section`) is removed and replaced by `.acc-perms-strip` rendered between the header and the `.acc-body` grid.
9. On mobile (viewport < 900px): the strip stacks vertically — kicker on top, pills below. `flex-direction: column`.

**Edge cases:**
- Admin with no pills to deny: the right section contains only can-pills; no empty space.
- Very long pill list on narrow viewport: pills wrap naturally (flex-wrap); no horizontal overflow.
- Role value not recognised (defensive): show a single pill `✗ unknown role` in the can't-pills section and log a warning server-side.

**Access control:** Strip is always shown for all roles. The server generates it based on `req.session.role`; the content is not user-controllable.

**Test data:** Test with admin, editor, and viewer accounts. Confirm pill counts: admin 9 can / 0 cant, editor 6 can / 3 cant, viewer 5 can / 4 cant.

**Browser/device support:** Desktop + mobile.

> **Technical notes:**
>
> Replace `buildPermsPills(role)` in `src/routes/account.js` with a new function `buildPermsStrip(role)` that returns the full strip HTML. Update the call site in `renderAccountPage` to render the strip between the header and the body grid.
>
> The current CSS classes `.acc-perms` and `.acc-perm` / `.acc-perm.yes` (style.css lines 1810–1812) are superseded. Add the new `.acc-perms-strip`, `.acc-perms-kicker`, `.acc-perms-pills`, `.acc-pill-can`, `.acc-pill-cant` classes to `public/style.css`.
>
> Requires `--accent-3` token to be defined (see DS-ACC-2 technical notes).

---

**DS-ACC-4 — Role-specific left column cards (uploads mosaic, favourites grid, activity log)**
As a logged-in user, I can see role-appropriate content in the left column of my account page (recent uploads for admin/editor, favourites and activity for viewer), so the page shows information relevant to what my role lets me do.

**Acceptance criteria:**

1. The left column always shows "Your details" as its first card for all roles. This is the existing inline-editable profile section (ACC-2), restyled with `.acc-card-block` + `.acc-card-title` (per DS-ACC-1).

2. **Admin and editor — Recent uploads mosaic card** (class `.acc-uploads-card`):
   - Card title: `h3.acc-card-title` with text `your recent uploads` + a mono count in `var(--ink-faint)` showing total upload count, e.g. `your recent uploads  <span class="acc-card-count">42</span>`.
   - Card has `.d1-tape` washi-tape decoration (ochre, default).
   - The mosaic grid uses class `.acc-uploads-mosaic`: `display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 70px; gap: 4px`.
   - The first cell spans `grid-column: span 2; grid-row: span 2`.
   - Up to 10 photos are shown (the existing `recentUploads` query, `LIMIT 10`). Each cell is a `<a href="/photos/[id]">` containing a `<img src="/photos/[id]/thumb">` with `object-fit: cover; width: 100%; height: 100%`.
   - If no uploads exist: show a single-cell placeholder with class `.acc-mosaic-empty` containing text `no uploads yet` in Kalam 13px `var(--ink-faint)`.
   - Photo placeholder (before real thumbnails exist): `background: var(--paper-2); border: 1px dashed var(--ink-faint)` with diagonal hatch (same as avatar background). Use this as `<img>` fallback on `onerror`.
   - Editor-only: a hint line below the mosaic: `<p class="acc-uploads-hint">you're free to delete or re-tag any of yours</p>`, Kalam 11px, `var(--ink-faint)`.
   - Admin sees no hint line.

3. **Admin and editor — Tag recipes card** (class `.acc-recipes-card`):
   - Card title: `your tag recipes` + count span + `"new +"` link in `var(--accent)` aligned right via `acc-card-more`.
   - Shows up to 3 recipe rows (for admin) or 2 (for editor) from the `tag_recipes` table for this user, ordered by `created_at DESC`. The existing `statsRecipes` count query already covers the total.
   - A new DB query is needed: `SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3` (admin) / `LIMIT 2` (editor). Add this to the `Promise.all` in `GET /account`.
   - Each recipe row uses class `.acc-recipe-row`: `display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--ink-faint)`. Last row: `border-bottom: none`.
   - Recipe name: `font-family: 'Caveat', cursive; font-size: 20px; font-weight: 700`.
   - Photo count from `query_json` is not computed on this page; show `—` for now with a `/* TODO */` comment.
   - Row is `<a href="/tags/recipes/[id]">` linking to the recipe editor.
   - If no recipes exist: show `no recipes yet — <a href="/tags/recipes/new">create one</a>` in Kalam 13px.
   - Card has `.d1-tape--cool` (blue tape) for admin; `.d1-tape--green` (sage tape) for editor.

4. **Viewer — Favourites grid card** (class `.acc-favourites-card`):
   - Replaces the "recent uploads" card entirely for viewer role.
   - Card title: `your favourites` + count span.
   - Requires a `photo_likes` (or `favourites`) table to exist. Until it does, the card body shows: `<p class="acc-fav-empty">nothing starred yet</p>` in Kalam 13px. Add a `/* TODO: DS-ACC-4 — photo_likes table not yet implemented */` comment in the query.
   - When the table exists: grid of up to 8 thumbnails using class `.acc-favs-mosaic`: `display: grid; grid-template-columns: repeat(8, 1fr); grid-auto-rows: 55px; gap: 3px`. No large-spanning cells (uniform grid).
   - Card has `.d1-tape--green` (sage tape).

5. **Viewer — Activity log card** (class `.acc-activity-card`):
   - Appears below the favourites card in the viewer's left column.
   - Card title: `your activity` with subtitle `last 14 days` in `var(--ink-faint)` Kalam 11px.
   - Requires an `activity_log` or `user_activity` table. Until it exists, card body shows: `<p class="acc-activity-empty">no activity recorded yet</p>`. Add `/* TODO: DS-ACC-4 — activity_log table not yet implemented */`.
   - When the table exists: list of up to 14 rows. Each row: icon glyph + action description + relative timestamp.
   - Card has no tape decoration.

6. Role gating is enforced server-side: viewer receives the `acc-favourites-card` and `acc-activity-card` HTML; admin/editor receive `acc-uploads-card` and `acc-recipes-card` HTML. The server never sends the wrong cards to the wrong role.

7. The existing `_recentUploads` data is already fetched in `GET /account` (variable currently prefixed with `_` meaning unused in the template). Wire it into the new mosaic card HTML (admin/editor only). For viewer, the query continues to return `[]`.

**Edge cases:**
- Admin with 0 uploads: mosaic shows empty-state copy.
- Editor with exactly 1 upload: mosaic shows 1 cell (no layout breakage with partial fill).
- Editor with 10 uploads: mosaic shows all 10.
- Admin with 0 recipes: show "no recipes yet" link.
- Viewer with favourites table but 0 starred photos: show "nothing starred yet".
- Viewer with 8+ starred photos: show exactly 8 cells.

**Access control:** Admin and editor see uploads mosaic and recipes card. Viewer sees favourites and activity. No cross-role leakage.

**Test data:** Admin/editor accounts with 0, 1, 6, 10 uploads. Admin/editor with 0, 1, 3 recipes. For viewer: create `photo_likes` stub data once the table exists.

**Browser/device support:** Desktop + mobile. On mobile (< 900px), the mosaic cells shrink gracefully; minimum cell size enforced by `min-height: 50px` on `.acc-uploads-mosaic`.

> **Technical notes:**
>
> In `renderAccountPage`, replace the `_recentUploads` ignored variable with actual mosaic HTML generation. Refactor `buildLeftColumn(role, data)` helper function.
>
> New query to add in `GET /account` Promise.all:
> ```js
> // [N] tag recipes for display in card (not just count)
> db.query(
>   `SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`,
>   [userId]
> )
> ```
>
> Photo thumbnail serving: the existing `GET /photos/:id/thumb` endpoint (or equivalent) must be used for mosaic cells. If no thumbnail endpoint exists, use the full-size photo with `object-fit: cover`. Check `src/routes/photos.js` for the correct thumbnail URL pattern.
>
> Favourites and activity queries are deferred to when those tables exist. Use `Promise.resolve({ rows: [] })` as placeholders.

---

**DS-ACC-5 — Role-specific right column cards (albums grid, admin tools, shared-with, "what you can't do")**
As a logged-in user, I can see role-appropriate action cards in the right column of my account page, so I have quick access to the things my role lets me manage.

**Acceptance criteria:**

1. **Admin and editor — Albums grid card** (class `.acc-albums-card`):
   - Card title: `your albums` + count span (total album count) + `"N more →"` link to `/albums` using `.acc-card-more` if count > 4.
   - Shows up to 4 album tiles in a 2×2 grid (class `.acc-albums-grid`): `display: grid; grid-template-columns: 1fr 1fr; gap: 8px`.
   - Each tile (class `.acc-album-tile`): `border: 1.5px solid var(--ink); border-radius: 0; background: var(--paper-2); padding: 10px 12px; cursor: pointer; transition: transform 0.1s`. Hover: `transform: translate(-1px, -1px); box-shadow: 2px 2px 0 var(--ink)`.
   - Tile content: album title in `font-family: 'Caveat', cursive; font-size: 20px; font-weight: 700`. Below it: a photo count or creation date in Kalam 11px `var(--ink-faint)`.
   - Tile is an `<a href="/albums/[id]">` linking to the album detail page.
   - If no albums exist: single `.acc-albums-empty` cell with text `no albums yet — <a href="/albums/new">create one</a>`.
   - Card has `.d1-tape` (ochre) for admin; `.d1-tape--cool` for editor.
   - The `_albums` data (currently prefixed with `_` in `renderAccountPage`) is wired into this card (admin/editor only). The existing DB query already fetches `id, title` — extend it to also fetch `created_at` and a photo count:
     ```sql
     SELECT a.id, a.title, a.created_at,
            COUNT(ap.photo_id)::int AS photo_count
     FROM albums a
     LEFT JOIN album_photos ap ON ap.album_id = a.id
     WHERE a.user_id = $1
     GROUP BY a.id
     ORDER BY a.created_at DESC
     LIMIT 4
     ```
     (For the viewer route, keep the existing `album_access` join but `LIMIT 4`.)

2. **Admin only — Admin tools card** (class `.acc-admin-tools-card`):
   - Only rendered when `role === 'admin'`.
   - Card has a `.d1-tape--red` (rose tape) decoration.
   - A badge `ADMIN ONLY` appears in the card title row: mono 9px, letter-spacing 1.5px, `color: oklch(55% 0.20 25); border: 1px solid oklch(55% 0.20 25)`, positioned right.
   - Tools rendered as a 2-column grid (class `.acc-tools-grid`): `display: grid; grid-template-columns: 1fr 1fr; gap: 8px`. The storage tile spans full width (`.acc-tool-tile.full { grid-column: span 2 }`).
   - Five tool tiles (class `.acc-tool-tile`), each is an `<a href="[url]">`:
     - Users → `/admin/users`: title `users`, count = total user count from DB.
     - Manage tags → `/tags/manage`: title `manage tags`, count = total tag count.
     - All albums → `/albums?scope=all`: title `all albums`, count = total album count across all users.
     - All recipes → `/tags/recipes?scope=all`: title `all recipes`, count = total recipe count.
     - Storage → `/admin/storage` (or `#` if not yet implemented): title `storage`, value = storage usage percentage. Full-width tile.
   - Each tile CSS: `border: 1.5px solid var(--ink); border-radius: 0; background: var(--paper); padding: 10px 12px; text-decoration: none; display: block`. Hover: `transform: translate(-1px, -1px); box-shadow: 2px 2px 0 var(--ink)`.
   - Tile title: `font-family: 'Caveat', cursive; font-size: 20px; font-weight: 700`.
   - Tile count/value: `font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent); float: right`.
   - Tile description: `font-family: 'Kalam', cursive; font-size: 12px; color: var(--ink-soft); margin-top: 4px`.
   - Admin tool counts require 4 new DB queries in `GET /account` (only executed when `role === 'admin'`):
     ```js
     role === 'admin' ? db.query('SELECT COUNT(*)::int AS n FROM users') : null,
     role === 'admin' ? db.query('SELECT COUNT(*)::int AS n FROM tags') : null,
     role === 'admin' ? db.query('SELECT COUNT(*)::int AS n FROM albums') : null,
     role === 'admin' ? db.query('SELECT COUNT(*)::int AS n FROM tag_recipes') : null,
     ```
     Use `Promise.resolve(null)` for non-admin roles; check for `null` before rendering.
   - Storage percentage: defer to `/* TODO: DS-ACC-5 storage tile */`; show `–%` for now.

3. **Editor only — Shared-with card** (class `.acc-shared-card`):
   - Only rendered when `role === 'editor'`.
   - Card title: `shared with`.
   - Shows a list of users the editor has explicitly shared albums with. Requires query:
     ```sql
     SELECT DISTINCT u.id, u.name, u.avatar_s3_key,
            COUNT(DISTINCT aa.album_id)::int AS album_count
     FROM album_access aa
     JOIN albums a ON a.id = aa.album_id AND a.user_id = $1
     JOIN users u ON u.id = aa.viewer_id
     GROUP BY u.id
     ORDER BY u.name ASC
     ```
   - Each row (class `.acc-shared-row`): mini avatar circle (24px) + user name (Kalam 14px) + `X albums` count (mono 10px `var(--ink-faint)`) + `revoke` button.
   - The `revoke` button sends `DELETE /albums/access?viewer_id=[id]` (or equivalent endpoint — confirm with albums route). On success, the row is removed from the list without page reload.
   - If no shares exist: `<p class="acc-shared-empty">not sharing with anyone yet</p>`.
   - Card has `.d1-tape--cool` (blue tape).
   - If the revoke endpoint does not yet exist, render the button as disabled with `/* TODO: DS-ACC-5 revoke endpoint */` comment.

4. **Viewer only — Tag recipes card (prominent)** (class `.acc-viewer-recipes-card`):
   - Only rendered when `role === 'viewer'`.
   - Card title: `your tag recipes` with a `YOUR THING` badge: `background: oklch(96% 0.02 140); border: 1.5px solid var(--accent-3); color: var(--accent-3); font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; vertical-align: middle; margin-left: 8px`.
   - Shows up to 4 recipe rows using the same `.acc-recipe-row` spec from DS-ACC-4 criterion 3.
   - Footer row: `<a href="/tags/recipes/new" class="acc-pill-can">+ new recipe</a>` + `<a href="/tags/recipes?scope=community" class="acc-pill-cant" style="text-decoration:none">browse community recipes</a>`.
   - Card has `.d1-tape--green` (sage tape).

5. **Viewer only — "What you can't do here" card** (class `.acc-viewer-limits-card`):
   - Only rendered when `role === 'viewer'`.
   - Card background is light green tint: `background: oklch(97% 0.02 140); border: 1.5px solid var(--accent-3)`.
   - Card title: `what you can't do here` in `var(--accent-3)`.
   - Shows 4 muted pills (same `.acc-pill-cant` style): `upload photos`, `create albums`, `share albums`, `manage users`.
   - Below the pills, a call to action: `<p class="acc-limits-cta">→ ask [admin_name] for editor rights</p>`. `[admin_name]` is fetched from DB: `SELECT name FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`. The `→ ask ...` text is a `mailto:` link to the admin's email (fetched alongside their name).
   - If no admin is found: show `→ contact the site owner for editor rights` (plain text).
   - Card has no tape decoration.

6. Role gating is enforced server-side for all cards in this story. Server only sends HTML for cards the current role is entitled to see. No client-side show/hide.

7. The existing `buildQuickLinks` function and its rendered card are removed from `renderAccountPage`. Its functionality is absorbed into the role-specific cards (Albums grid links to `/albums`, Admin tools link to management pages, etc.). The "Change password" quick link moves into the "Your details" card footer as a plain `<a>` link: `<a href="/account/password" class="acc-details-pw-link">change password →</a>` in Caveat 14px `var(--accent)`.

**Edge cases:**
- Admin with 0 of everything: all tool counts show `0`. Storage shows `–%`.
- Editor with 0 albums: albums card shows empty-state.
- Editor shared with 0 people: shared-with card shows empty-state.
- Viewer with 0 recipes: viewer recipes card shows "no recipes yet" with "+ new recipe" link.
- Site with 0 admins (edge): viewer's "ask admin" card shows plain-text fallback.
- Album count > 4: "N more →" link appears; only first 4 tiles render.

**Access control:**
- Admin tools card: rendered only for `role === 'admin'`; server enforces this.
- Shared-with card: rendered only for `role === 'editor'`; server enforces this.
- Viewer limit card: rendered only for `role === 'viewer'`; server enforces this.
- The admin tool counts must not be exposed to non-admin roles (no data leakage via API).

**Test data:**
- Admin with 1, 4, 5+ albums; editor with 0, 4, 5+ albums.
- Editor who has shared with 0, 1, 3+ users.
- Viewer with 0 and 4+ recipes.
- Site with a real admin to verify the "ask [name]" affordance.

**Browser/device support:** Desktop + mobile. Tool tiles and album tiles reflow to 1 column on mobile.

> **Technical notes:**
>
> Refactor `renderAccountPage` to use `buildRightColumn(role, data)` helper.
>
> Admin tool count queries must only run when `role === 'admin'`. Wrap in conditional inside `Promise.all`:
> ```js
> role === 'admin' ? db.query('SELECT COUNT(*)::int AS n FROM users') : Promise.resolve({ rows: [{ n: 0 }] }),
> ```
>
> Shared-with query runs only for `role === 'editor'`. The `album_access` table already exists (used by permissions.js).
>
> Viewer admin-name query: run only when `role === 'viewer'`. Fetches `name` and `email` from `users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`.
>
> `_albums` is already fetched in the existing `Promise.all` (currently unused). Wire it into the albums grid card. Extend the query with `photo_count` aggregate (see criterion 1 SQL above) and change `LIMIT` to 4.
>
> `/albums/access` (revoke) endpoint: check `src/routes/albums.js` for whether a `DELETE` endpoint for individual access grants exists. If not, mark with `/* TODO */` and disable the revoke button.

---

**DS-ACC-6 — Design token alignment and missing CSS**
As a developer, the account page CSS must declare all required design tokens and card-chrome classes precisely matching the design handoff, so all account page components render with the correct paper aesthetic.

**Acceptance criteria:**

1. The following design tokens are added to the `:root` block in `public/style.css` (currently only `--paper`, `--paper-2`, `--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--accent`, `--accent-cool`, `--danger` exist):
   ```css
   --accent-2:  oklch(62% 0.14 220);  /* cool blue — editor badge, editor tape */
   --accent-3:  oklch(64% 0.13 140);  /* sage green — viewer badge, can-pills */
   --paper-3:   #e3ddcb;              /* darker paper — some card accents */
   ```
   Note: `--accent-cool` already exists and equals `oklch(62% 0.14 220)`. Add `--accent-2` as an alias pointing to the same value so the design system names match the handoff vocabulary without breaking existing `--accent-cool` usages.

2. All account page cards (`.acc-card-block`) have `border-radius: 0` explicitly declared. Verify no inherited `border-radius` from global `.card` styles applies.

3. The `.role-badge` class (line 1801 in `style.css`) is updated to add `letter-spacing: 2px`. A new modifier `.role-badge.admin` is updated to remove the solid accent background (was `background: var(--accent)`) and instead use `color: oklch(55% 0.20 25); border-color: oklch(55% 0.20 25); background: oklch(96% 0.02 25)` matching the design. New modifiers are added:
   - `.role-badge.editor { border-color: var(--accent-2); background: oklch(96% 0.02 220); color: var(--accent-2) }`
   - `.role-badge.viewer { border-color: var(--accent-3); background: oklch(96% 0.02 140); color: var(--accent-3) }`

4. Permission strip can-pill and can't-pill styles (DS-ACC-3) are added. The existing `.acc-perm` / `.acc-perm.yes` classes remain for backward compatibility but are no longer used on the account page.

5. The `.acc-stat-tile` (DS-ACC-2) and its child classes `.acc-stat-num` / `.acc-stat-label` / `.acc-stat-tile--muted` are added to `style.css` with the exact values specified in DS-ACC-2.

6. The `.acc-tool-tile` class (DS-ACC-5) includes the hard-edge ink shadow on hover: `transform: translate(-1px, -1px); box-shadow: 2px 2px 0 var(--ink)`. No `border-radius`. No soft `box-shadow`.

7. No `border-radius` is ever applied to `.acc-card-block`, `.acc-tool-tile`, `.acc-album-tile`, or `.acc-recipe-row`. Pills (`.acc-pill-can`, `.acc-pill-cant`) use `border-radius: 999px`. Avatar uses `border-radius: 50%`. Those are the only border-radius values permitted on the account page.

8. The `field-row` label (`.acc-field-label`) currently uses `font-size: 0.8rem`. Change to `font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase` to match the handoff spec for mono kicker labels (min-width stays 100px, but the handoff calls for `min-width: 100px` exactly).

9. The page body for `/account` should apply the dotted paper background (criterion 9 from DS-ACC-1) without affecting other routes. This can be done by adding class `.acc-page` to the `<body>` tag via a route-level CSS addition, or by scoping the background to `.acc-page-bg` wrapper. Preferred approach: add `class="acc-page"` to a wrapper `<div>` wrapping the entire account page body, not to `<body>`.

10. No soft Gaussian `box-shadow` is used anywhere on the account page. The only shadow permitted is the hard-edge `2px 2px 0 var(--ink)` on tool-tile and album-tile hover states.

11. No emoji are used. The only glyphs used in the account page are: `★ ✎ ◎ ↻ ✓ ✗ →` (from the existing Unicode set already in use on the site).

**Edge cases:**
- `--accent-2` alias must not break existing usages of `--accent-cool` (different name, same value; both declarations coexist).
- If a future browser does not support `oklch()`, the fallback is the nearest hex approximation. Document this as a known limitation (no polyfill required for V1).

**Access control:** CSS-only story; no access control concerns.

**Test data:** Visual review with admin, editor, and viewer accounts. Check: role badge colors, can/can't pill colors, stat tile layout, card borders (no border-radius).

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile. `oklch()` is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+).

> **Technical notes:**
>
> All CSS changes in `public/style.css`. Group under a `/* ── Account page design alignment (DS-ACC) ── */` comment block. Keep existing `.acc-section`, `.acc-perm`, `.acc-field-*` classes intact (used by sub-pages and for backward compat during transition).
>
> The `--accent-cool` → `--accent-2` alias: add `--accent-2: var(--accent-cool)` to `:root` so the handoff naming works without a search-replace.
>
> Check for any `border-radius` on global `.card` class (style.css line 99) — the `.acc-card-block` class must explicitly override it with `border-radius: 0`.
>
> QA visual checklist (screenshot comparison targets): header 3-column grid, 130px avatar with hatch, role badge rotation, stats strip with vertical rules, permission strip with washi-tape, two-column body layout, tool-tile hover shadow, recipe row layout.
