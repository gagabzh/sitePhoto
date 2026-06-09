# Nextcloud

**US-NC1 — Link a photo to Nextcloud**
As an editor, I can attach a Nextcloud share link to a photo, so viewers can download the original high-quality file directly from Nextcloud.

**Acceptance criteria:**

1. On the photo detail page (`GET /photos/:id`), an editor sees a "Nextcloud link" section below the photo metadata. If no link is set, this section shows a placeholder ("No Nextcloud link") and an "Add link" button.
2. Clicking "Add link" reveals an inline text input (type `url`) with a "Save" button and a "Cancel" button. No page navigation occurs.
3. The input accepts any URL whose hostname ends with a recognisable Nextcloud path component: the URL must begin with `https://` and contain `/s/` followed by at least one non-slash character (the share token). Example: `https://cloud.example.com/s/abc123def456`. Any URL that does not match this pattern returns HTTP 422 with `{ "error": "Not a valid Nextcloud share link." }`.
4. Clicking "Save" sends `PATCH /photos/:id/nextcloud-url` with body `{ "nextcloudUrl": "<value>" }`. On success (200), the input is replaced by the stored URL rendered as plain text (not a hyperlink — the download action is on the photo page via NC-2). An "Edit" icon and a "Remove" icon appear beside the URL.
5. If the URL passes client-side format validation but the server returns 422, the error message from the response body is shown beneath the input. The input remains open.
6. The `PATCH /photos/:id/nextcloud-url` endpoint is protected by `requireAuth` and `requireEditor`. A viewer calling this endpoint returns HTTP 403. An editor calling it for a photo they do not own returns HTTP 403. An unauthenticated request returns HTTP 401.
7. The endpoint uses `wrapAsync`. The endpoint validates the CSRF token (`X-CSRF-Token` header). An invalid or missing token returns HTTP 403.
8. URL length limit: maximum 2048 characters. Exceeding this returns HTTP 422 with `{ "error": "URL too long." }`.
9. The `nextcloud_url` value is stored in the `photos` table (see Technical notes). The DB column is nullable; NULL means no link set.
10. A viewer visiting the same photo detail page does not see the "Add link" / "Edit" / "Remove" controls; they see only the read-only display of the URL (or nothing if unset). The Download original button (NC-2) is rendered only when a URL is set.
11. On mobile (viewport < 600 px), the "Add link" / "Save" / "Cancel" / "Edit" / "Remove" controls are touch-friendly, with minimum 44×44 px tap targets. The URL input is full-width.

**Error states:**
- Network timeout or 5xx: show "Could not save — try again." beneath the input. Input remains open.
- 422 (invalid URL format): show the `error` field from the response body beneath the input.
- 422 (URL too long): show "URL too long. Maximum 2048 characters." beneath the input.
- 403 (wrong role or ownership): show "You do not have permission to edit this photo." The input closes.
- 401 (session expired): redirect to `/login`.

**Edge cases:**
- Editor saves the same URL that is already stored: accepted (idempotent update, returns 200).
- Editor pastes a URL with trailing whitespace: the server trims the value before validating and storing.
- Editor sets a URL, then another editor (with access to the photo) updates it: last write wins.
- URL is exactly 2048 characters: accepted. URL is 2049 characters: rejected with 422.
- Photo does not exist (`:id` not in DB): `PATCH /photos/:id/nextcloud-url` returns HTTP 404.

**Access control:**
- Only editors can set or change the `nextcloud_url` on a photo.
- An editor can only modify photos they own (the photo's `user_id = req.session.userId`) — unless they are an admin.
- Admins can set or change the `nextcloud_url` on any photo.
- Viewers can read the stored URL (used for NC-2) but cannot modify it.

**Test data:** Create an editor account and two photos: one with no Nextcloud URL and one with an existing URL. Create a viewer account on the same album to confirm read-only rendering. Prepare a 2048-char URL and a 2049-char URL.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The inline-edit interaction must be keyboard-accessible: Tab to "Add link" button, Enter to open input, Tab to input, Tab to Save, Enter to confirm, Escape to cancel.

> **Technical notes:**
>
> **Schema — `nextcloud_url` column on `photos` (migration `v12.sql`):**
> ```sql
> ALTER TABLE photos ADD COLUMN IF NOT EXISTS nextcloud_url TEXT;
> ```
> This column is shared by NC-1, NC-2, NC-3, and NC-4. All four stories use the same migration file.
>
> **API endpoint:** `PATCH /photos/:id/nextcloud-url` in `src/routes/photos.js`. Accepts `application/json`. Returns `200 { "ok": true }` on success. Ownership check: `SELECT user_id FROM photos WHERE id = $1` then compare with `req.session.userId` (or allow if admin).
>
> **URL validation (server-side):** Use a simple regex: `/^https:\/\/.+\/s\/[^/]+/`. Trim the input first. Reject if longer than 2048 chars.
>
> **Out of scope:** Verifying that the URL actually resolves or is a live Nextcloud share (no outbound HTTP call in NC-1). Showing a thumbnail preview from Nextcloud. Restricting link-setting to the photo owner only at DB level (ownership check is in the route handler).

---

**US-NC2 — Download original from photo page**
As a viewer, I can click a "Download original" button on a photo page to be redirected to the Nextcloud link, so I can get the full-resolution file without it being stored on this server.

**Acceptance criteria:**

1. On `GET /photos/:id`, when `nextcloud_url` is set on the photo, a "Download original" button is rendered below the photo. When `nextcloud_url` is NULL or empty, the button is not rendered.
2. Clicking "Download original" navigates the browser to the stored `nextcloud_url` value via a standard `<a href="..." target="_blank" rel="noopener noreferrer">` link. No JavaScript redirect or fetch call is used. The link opens in a new tab.
3. The button is visible to all logged-in users who have access to the photo (viewers, editors, admins).
4. The button is not visible to unauthenticated users. The photo detail page itself requires authentication (`requireAuth`).
5. The label is "Download original" in English. The button is rendered as a secondary-style anchor element (not a primary call-to-action).
6. If a viewer accesses `GET /photos/:id` for a photo they do not have permission to view (album sharing rules enforced by `src/permissions.js`), the server returns HTTP 403 or HTTP 404. The Nextcloud URL is never exposed to an unauthorised viewer even if the URL is set.
7. On mobile, the "Download original" link is at minimum 44×44 px tap target.

**Error states:**
- The Nextcloud link resolves to a 404 or expired share: this is handled by Nextcloud itself in the new browser tab. sitephoto does not attempt to validate the link on render; the user sees the Nextcloud error page.
- Photo not found (`:id` does not exist): `GET /photos/:id` returns HTTP 404 regardless of authentication status.

**Edge cases:**
- `nextcloud_url` is stored but empty string (edge case from NC-3 removal path if a bug causes an empty string instead of NULL): treat empty string the same as NULL — do not render the button. Add a guard in the template: `if (photo.nextcloud_url && photo.nextcloud_url.trim())`.
- Photo has both a Nextcloud URL and is in a private album (not shared with current viewer): viewer cannot reach `GET /photos/:id` at all (permissions.js returns 403), so the URL is not leaked.
- Editor visits the page: they also see "Download original" when the URL is set, plus the edit controls from NC-1.

**Access control:**
- Any logged-in user with read access to the photo can see and click the "Download original" button.
- Users without access to the photo cannot access the photo page at all (HTTP 403/404).
- The `nextcloud_url` value is not exposed via any unauthenticated API endpoint.

**Test data:** Create a photo with a valid Nextcloud URL set. Create a viewer account with access to the album containing the photo. Create a second viewer account without access. Create a photo with `nextcloud_url = NULL` to verify button absence.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The `<a target="_blank">` approach works natively across all supported browsers.

> **Technical notes:**
>
> **Rendering:** In the photo detail view template, check `photo.nextcloud_url` before rendering the button:
> ```html
> <% if (photo.nextcloud_url) { %>
>   <a href="<%= photo.nextcloud_url %>" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
>     Download original
>   </a>
> <% } %>
> ```
> Ensure the value is HTML-escaped in the template (EJS auto-escapes `<%= %>`).
>
> **No new endpoint needed.** `GET /photos/:id` already fetches the photo row; add `nextcloud_url` to the SELECT columns. No API change required beyond the column addition from NC-1.
>
> **Out of scope:** Tracking download clicks. Proxying the download through the server. Showing the Nextcloud file metadata (name, size). Any visual indication of whether the Nextcloud link is still live.

---

**US-NC3 — Manage Nextcloud link**
As an editor, I can update or remove the Nextcloud link on any of my photos at any time.

**Acceptance criteria:**

1. On the photo detail page, when a Nextcloud URL is already set, an editor sees:
   - The stored URL displayed as plain text.
   - An "Edit" icon button (aria-label: "Edit Nextcloud link") beside the URL.
   - A "Remove" icon button (aria-label: "Remove Nextcloud link") beside the URL.
2. Clicking "Edit" replaces the plain-text URL with a pre-filled inline text input containing the current URL. A "Save" button and a "Cancel" button appear. This is the same inline-edit behaviour as NC-1 criteria 2–5.
3. Saving a new URL via the "Edit" flow sends `PATCH /photos/:id/nextcloud-url` with the new value. All NC-1 validation rules apply (format, length limit).
4. Clicking "Remove" sends `DELETE /photos/:id/nextcloud-url`. On success (200), the URL display, "Edit" button, and "Remove" button are replaced by the "No Nextcloud link — Add link" state from NC-1 criterion 1. The "Download original" button (NC-2) is also removed from the page immediately without a full reload.
5. `DELETE /photos/:id/nextcloud-url` sets `nextcloud_url = NULL` in the DB for the given photo. It does not delete the photo or any S3 data.
6. `DELETE /photos/:id/nextcloud-url` is protected by `requireAuth` and `requireEditor`. Same ownership rules as NC-1 criterion 6.
7. `DELETE /photos/:id/nextcloud-url` validates the CSRF token. Missing or invalid token returns HTTP 403.
8. `DELETE /photos/:id/nextcloud-url` uses `wrapAsync`.
9. Attempting to delete a Nextcloud URL from a photo that has no URL set returns HTTP 200 (idempotent delete — the goal is achieved).
10. On mobile, the "Edit" and "Remove" icon buttons are minimum 44×44 px tap targets and do not overlap.

**Error states:**
- Network timeout or 5xx on remove: show "Could not remove link — try again." beside the "Remove" button. The URL display is not removed.
- 403 on remove (wrong role or ownership): show "You do not have permission to edit this photo." The URL display is not removed.
- 401 on remove (session expired): redirect to `/login`.
- All NC-1 error states apply to the "Edit" flow.

**Edge cases:**
- Editor removes a URL, then immediately clicks "Add link" and saves the same URL: allowed (round-trip, results in the URL being set again).
- Two editors editing the same photo simultaneously: last write wins for `PATCH`; last delete wins for `DELETE`. No conflict detection.
- Photo does not exist: `DELETE /photos/:id/nextcloud-url` returns HTTP 404.

**Access control:** Same as NC-1. Editors can only modify their own photos (or any photo if admin). Viewers see the "Download original" button (NC-2) but not the edit or remove controls.

**Test data:** Create a photo with a Nextcloud URL set. Log in as editor (owner), confirm edit and remove work. Log in as a second editor (non-owner), confirm 403. Log in as admin, confirm both edit and remove work.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). Edit and remove must be keyboard-accessible: Tab to "Edit" or "Remove" button, Enter to activate, Escape to cancel (for edit flow).

> **Technical notes:**
>
> **New endpoint:** `DELETE /photos/:id/nextcloud-url` in `src/routes/photos.js`.
> ```sql
> UPDATE photos SET nextcloud_url = NULL WHERE id = $1 AND user_id = $2;
> ```
> If `rowCount === 0` and photo exists with a different `user_id`, return 403. If photo does not exist at all, return 404. If `rowCount === 0` because `nextcloud_url` was already NULL, return 200 (idempotent).
>
> **Ownership check pattern:** First `SELECT id, user_id FROM photos WHERE id = $1`. If no row: 404. If `user_id !== req.session.userId` and `req.session.role !== 'admin'`: 403. Then run the UPDATE.
>
> **The `PATCH /photos/:id/nextcloud-url` endpoint** (from NC-1) is reused unchanged for the edit flow. No new endpoint needed for update.
>
> **UI state machine (client-side):** Three states for the Nextcloud section: `empty` (no URL, show "Add link"), `set` (URL present, show URL + Edit + Remove), `editing` (inline input open). Manage via a small JS class or simple variable on the page. No framework required.
>
> **Out of scope:** Undo/redo for link removal. Bulk removal across multiple photos. History of previous Nextcloud URLs.

---

**US-NC4 — Import a Nextcloud shared folder**
As an editor, I can paste a Nextcloud public folder share link into an import form. The app lists all photos found in that folder (via WebDAV), uploads them all to sitephoto asynchronously, and stores the share URL on each imported photo. I can optionally apply common tags and a place to every photo in the import, and choose to group them into a new album — so a whole Nextcloud folder can be imported in one action without downloading anything manually.

**Acceptance criteria:**

1. On `GET /photos`, an editor sees an "Import from Nextcloud" button/link. Clicking it opens an import modal or a dedicated page (`GET /photos/nextcloud-import`). Viewers and unauthenticated users do not see this button.
2. The import form contains:
   - A URL text input (label: "Nextcloud folder share link") — required.
   - A "Preview" button that triggers the server-side PROPFIND listing.
   - (Step 2, after preview) A tags input (optional, comma-separated tag names to apply to all imported photos).
   - (Step 2) A place input (optional, free-text place name applied to all imported photos).
   - (Step 2) An album name input (optional; if filled, all imported photos are grouped into a new album with that name created by the import).
   - A "Start import" button (disabled until preview succeeds and at least 1 photo was found).
   - A "Cancel" button that closes the modal/page.
3. Clicking "Preview" sends `POST /photos/nextcloud-import` with body `{ "shareUrl": "<value>" }`. The server:
   a. Validates URL format: must begin with `https://` and contain `/s/` followed by the share token. Invalid format returns HTTP 422 with `{ "error": "Not a valid Nextcloud folder share link." }`.
   b. Extracts the share token from the URL path (the segment after `/s/`).
   c. Issues a WebDAV `PROPFIND` request to `{shareUrl}/public.php/webdav/` with `Depth: 1` header and HTTP Basic auth `{token}:` (token as username, empty password), using Node.js built-in `https`/`http`. No new npm packages.
   d. Parses the XML response to extract all `<D:response>` entries. Filters for MIME types `image/jpeg`, `image/png`, `image/webp` (from the `<D:getcontenttype>` element). Non-image files (PDFs, videos, documents) are silently ignored.
   e. Returns `200 { "files": [{ "name": "IMG_001.jpg", "size": 3145728, "mimeType": "image/jpeg" }, ...], "total": N }` where `total` is the count of image files found.
4. On success, the UI displays a preview list: "Found N photos in this folder." with a scrollable list of filenames and sizes (up to 20 shown, with "+ M more" if > 20). The Step-2 optional fields (tags, place, album) become visible. The "Start import" button is enabled.
5. Clicking "Start import" sends `POST /photos/nextcloud-import/confirm` with body `{ "shareUrl": "...", "tags": ["tag1", "tag2"], "place": "Paris", "albumName": "Summer 2024" }`. Tags and place are optional (omit or empty string if not set). Album name is optional.
6. The confirm endpoint:
   a. Re-validates the URL (same check as step 3a — do not trust the client to pass the same URL).
   b. Re-runs the PROPFIND to get the current file list (the folder contents may have changed since preview). Uses the same token/auth logic.
   c. Creates the album record in the DB first if `albumName` is non-empty (INSERT into `albums`). Returns 422 if an album with the same name already exists for this user.
   d. For each image file found: enqueues one BullMQ job via a new `addNextcloudImportJob({ shareUrl, fileName, mimeType, userId, tags, place, albumId, importId })` queue producer function. The `importId` links back to the `nextcloud_imports` table row.
   e. Inserts a row into `nextcloud_imports` with `user_id`, `share_url`, `total = <count>`, `done = 0`, `failed = 0` before enqueueing jobs. Returns `200 { "importId": <id>, "total": N }`.
   f. If `total = 0` after re-PROPFIND (folder is empty or has no images), returns `422 { "error": "No photos found in this folder." }`. No import row is created.
7. Each BullMQ worker job (processed on Instance-2):
   a. Downloads the file from `{shareUrl}/public.php/webdav/{fileName}` using HTTP Basic auth `{token}:`.
   b. Generates a new UUID for the S3 key: `{uuid}{ext}` (ext derived from MIME type: `.jpg`, `.png`, `.webp`).
   c. Uploads the file buffer to S3 via `uploadPhoto(key, buffer, mimeType)`.
   d. Inserts the photo row into `photos`: `user_id`, `s3_key`, `nextcloud_url = shareUrl`, `place` (if set), `created_at = NOW()`.
   e. If `albumId` is set, inserts a row into `album_photos` (`album_id`, `photo_id`).
   f. For each tag name in `tags`: upserts into `tags` table, then inserts into `photo_tags`.
   g. Enqueues AI identification via `addIdentificationJob({ photoId, userId, photoS3Key })`.
   h. Increments `nextcloud_imports.done` by 1 (atomic `UPDATE nextcloud_imports SET done = done + 1 WHERE id = $1`).
   i. Emits `nextcloud-import-progress` socket.io event to the user via `notifyUser(userId, { event: 'nextcloud-import-progress', importId, done, total, failed })`.
   j. If any step a–f fails for this file: increments `nextcloud_imports.failed` by 1, emits progress with updated `failed` count, and moves on to the next file (does not abort the entire import).
8. `POST /photos/nextcloud-import` and `POST /photos/nextcloud-import/confirm` are protected by `requireAuth` and `requireEditor`. Viewers return 403. Unauthenticated requests return 401.
9. Both endpoints validate CSRF (`X-CSRF-Token` header). Missing or invalid token returns 403.
10. Both endpoints use `wrapAsync`.
11. Rate limiting: `POST /photos/nextcloud-import` (preview) is limited to 10 requests per 5 minutes per user to prevent PROPFIND flooding. Exceeding returns HTTP 429 with `{ "error": "Too many preview requests — try again in a few minutes." }`.
12. Maximum import size: if the PROPFIND returns more than 500 image files, the server returns HTTP 422 with `{ "error": "Folder contains too many photos (max 500). Split the folder and re-import." }`. The limit applies at both the preview and confirm steps.
13. After "Start import" succeeds (200 from confirm endpoint), the modal/page closes (or redirects to `GET /photos`) and the NC-5 progress banner is shown.

**Error states:**
- Preview — WebDAV 401 (token invalid or share expired): return HTTP 422 with `{ "error": "Could not access this Nextcloud share. The link may have expired or require a password." }`.
- Preview — WebDAV 404 (share not found): return HTTP 422 with `{ "error": "Nextcloud share not found. Check the link and try again." }`.
- Preview — WebDAV timeout (> 10 seconds): return HTTP 504 with `{ "error": "Nextcloud did not respond in time. Try again." }`.
- Preview — XML parse failure (unexpected response body): return HTTP 502 with `{ "error": "Unexpected response from Nextcloud. Is the link a folder share?" }`.
- Preview — folder is empty (PROPFIND succeeds but zero image files found): return HTTP 200 with `{ "files": [], "total": 0 }`. The UI shows "No photos found in this folder." The "Start import" button stays disabled.
- Preview — folder contains only non-image files: same as empty folder response.
- Confirm — PROPFIND re-check fails (same errors as preview): return corresponding HTTP error. No import row is created. No jobs enqueued.
- Confirm — album name already exists: HTTP 422 with `{ "error": "An album with this name already exists." }`.
- Worker job — S3 upload failure: increment `failed`, emit progress, continue with next file.
- Worker job — Nextcloud download failure (file gone between preview and import): increment `failed`, emit progress, continue.
- All jobs failed (`done = 0, failed = total` at completion): the import row records the failure. The NC-5 banner shows "Import finished — 0 of N succeeded."

**Edge cases:**
- Empty folder (PROPFIND succeeds, zero entries): handled by criterion 6f — no import started, user sees "No photos found."
- Folder contains 0 image files but has PDFs/videos/documents: same as empty — non-image files are filtered out, no import started.
- Folder contains exactly 1 image: import proceeds normally, 1 job enqueued.
- Folder contains 500 images (maximum): import proceeds normally. Preview shows "Found 500 photos" with "and 480 more." Confirm enqueues 500 jobs.
- Folder contains 501 images: preview returns 422 (too many).
- Duplicate filenames in the same folder: two files with the same name in the same WebDAV PROPFIND response are treated as two separate imports; each gets its own UUID-based S3 key. The `fileName` is stored in the job payload for the download URL only, not in the DB.
- Editor starts two imports from the same folder simultaneously (double-click or two tabs): two separate `nextcloud_imports` rows are created; both proceed independently. The editor will end up with duplicate photos.
- Album name is provided but the album creation fails (DB error): the confirm endpoint returns 500. No jobs are enqueued.
- Import is "cancelled" mid-way (user navigates away): jobs already enqueued continue running; there is no cancel mechanism in V1. The NC-5 banner will keep updating until all jobs finish.
- Worker is unavailable (Instance-2 still shelved): jobs queue in BullMQ; `instance-lifecycle.js` unshelves Instance-2 automatically when jobs are enqueued. Photos will appear once the worker comes online.

**Access control:**
- Only editors and admins can access `GET /photos/nextcloud-import`, `POST /photos/nextcloud-import`, and `POST /photos/nextcloud-import/confirm`.
- All photos created by the import are owned by `req.session.userId` (the editor who started the import).
- Viewers cannot initiate imports and do not see the "Import from Nextcloud" button.
- The Nextcloud share URL is stored on each imported photo as `nextcloud_url`; it is subject to the same access controls as any other photo field.

**Test data:**
- A public Nextcloud folder share with 3 JPEG files (for basic happy path).
- A public folder share with 1 PNG and 1 WebP (for MIME filtering).
- A public folder share with 0 image files (1 PDF only) — to test empty-folder path.
- A share URL that has expired or been deleted — to test 401/404 from WebDAV.
- A folder share with 21 files — to test the "+ M more" truncation in preview.
- A folder share with 501 files — to test the 500-file limit (or mock the PROPFIND response with 501 entries).
- For the album path: confirm that the album exists in the DB with the correct owner and that all imported photos appear in it.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The import form must be keyboard-accessible. On mobile, the preview list scrolls vertically; the "Start import" button is full-width.

> **Technical notes:**
>
> **Schema — `v12.sql`:**
> ```sql
> -- NC-1/2/3: Nextcloud URL on individual photos
> ALTER TABLE photos ADD COLUMN IF NOT EXISTS nextcloud_url TEXT;
>
> -- NC-4: import tracking
> CREATE TABLE IF NOT EXISTS nextcloud_imports (
>   id         SERIAL PRIMARY KEY,
>   user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
>   share_url  TEXT         NOT NULL,
>   total      INTEGER      NOT NULL,
>   done       INTEGER      NOT NULL DEFAULT 0,
>   failed     INTEGER      NOT NULL DEFAULT 0,
>   created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
> );
> ```
>
> **WebDAV client (no new packages):** Use Node.js built-in `https.request`. Set headers `Depth: 1`, `Content-Type: application/xml`, and `Authorization: Basic <base64(token:)>`. Send request body `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:getcontenttype/><D:displayname/></D:prop></D:propfind>`. Parse the response with Node.js built-in `xml` parsing (use `DOMParser` via `@xmldom/xmldom` — already a transitive dep — or a regex-based parser over `D:getcontenttype` tags if no XML library is available).
>
> **Token extraction:** `const token = new URL(shareUrl).pathname.split('/s/')[1]?.split('/')[0]`. If this yields an empty string, the URL validation at step 3a should have rejected it already.
>
> **BullMQ queue:** Add a second queue `nextcloud-import` (separate from the existing `identification` queue). Add a new `addNextcloudImportJob` function in `src/queue/producer.js`. The worker on Instance-2 processes this queue in `worker/src/worker.js` alongside the existing identification queue.
>
> **PROPFIND timeout:** Set a 10-second timeout on the outbound HTTP request. If the socket does not respond within 10 s, abort and return 504.
>
> **Atomic done/failed increments:** Use `UPDATE nextcloud_imports SET done = done + 1 WHERE id = $1 RETURNING done, total, failed` (or `failed = failed + 1` for failures). The RETURNING clause gives the current counts to include in the socket.io event without a second SELECT.
>
> **Out of scope:** Password-protected Nextcloud shares (requires an extra form field and auth header). Nested subfolder traversal (only the top-level folder is imported). Resuming a failed import. Deduplication of files already imported from the same share. Import scheduling (immediate only). Import history UI beyond the progress banner.

---

**US-NC5 — Import progress feedback**
As an editor, after launching a Nextcloud folder import, I see a live status on the photos page ("import in progress — X of Y done") that updates in real time until all photos are uploaded and identified.

**Acceptance criteria:**

1. Immediately after `POST /photos/nextcloud-import/confirm` returns 200, the browser navigates to (or already shows) `GET /photos`. A fixed banner appears at the top of the photos page:
   - While in progress: "Importing from Nextcloud — X of Y photos done" (e.g. "Importing from Nextcloud — 3 of 20 photos done").
   - While in progress with failures: "Importing from Nextcloud — X of Y photos done (F failed)" if `failed > 0`.
   - When complete (done + failed = total): "Import complete — X of Y photos imported." (or "Import complete — X of Y imported, F failed." if failures occurred). The banner persists for 5 seconds after completion, then dismisses itself.
2. The banner count updates in real time via socket.io without a page reload. Each `nextcloud-import-progress` event from the server carries `{ importId, done, total, failed }` and the client updates the banner text immediately on receipt.
3. The socket.io event name is `nextcloud-import-progress`. The client registers the listener when the photos page loads. If no import is in progress (no active `nextcloud_imports` row for the user), no banner is shown and the listener is a no-op.
4. On page load (`GET /photos`), the server checks for any active import for the logged-in user: `SELECT id, total, done, failed FROM nextcloud_imports WHERE user_id = $1 AND done + failed < total ORDER BY created_at DESC LIMIT 1`. If a row is found, the banner is rendered server-side with the current counts (so users who reload mid-import see the current state immediately without waiting for the next socket event).
5. If the user has multiple simultaneous imports (possible per NC-4 edge case), only the most recent active one is shown in the banner.
6. The banner is dismissible by clicking an "×" close button. Dismissing hides it for the rest of the page session only; it reappears on next page load if the import is still active.
7. The banner does not block the rest of the photos page. Photos that have already been imported (jobs completed) appear in the photos grid immediately without waiting for the entire import to finish.
8. The `nextcloud-import-progress` event is only emitted to the user who started the import (via `notifyUser(userId, payload)` from `src/notifications.js`). Other users do not receive the event.
9. If the WebSocket connection is lost mid-import (user's network drops), the banner freezes on the last known count. When the connection is re-established, the next `nextcloud-import-progress` event brings the banner back up to date. No periodic polling fallback is required for V1.
10. After the import finishes and the completion banner has auto-dismissed (5-second delay per criterion 1), the user can still see imported photos in the grid — photos appear as each job completes, not all at once at the end.
11. On mobile (viewport < 600 px), the banner is full-width, appears at the top of the viewport (fixed or sticky), and the "×" close button has a minimum 44×44 px tap target.
12. The progress banner is shown to editors only. Viewers do not initiate imports and will never see this banner.

**Error states:**
- All jobs fail (`failed = total`, `done = 0`): banner shows "Import failed — 0 of N photos could be imported. Check the Nextcloud share link." The banner persists until dismissed.
- Partial failure (`failed > 0, done + failed = total`): banner shows "Import complete — X of N imported, F failed."
- Socket.io not connected (user has JS disabled or an old browser): the server-side-rendered count from criterion 4 is shown statically. No live updates. The user can reload the page to see the current count.
- `GET /photos` query for active import fails (DB error): the banner is simply not rendered (fail silently — do not block the photos page).

**Edge cases:**
- User starts an import and immediately navigates away from the photos page: the socket.io listener is unregistered (page unloads). On return, the server-side-rendered banner resumes from the current count.
- User reloads the page after import completes (done + failed = total): the `SELECT` query finds no active imports (condition `done + failed < total` is false). No banner is shown.
- Import of exactly 1 photo: banner shows "Importing from Nextcloud — 0 of 1 photos done" then transitions to "Import complete — 1 of 1 imported."
- Import with 0 done and 0 failed but progress event arrives: this should not happen (the confirm endpoint only creates the row when it enqueues at least 1 job), but if it does, the banner shows "0 of 0" and the query condition `done + failed < total` with `total = 0` evaluates to false — no banner is rendered server-side.
- Concurrent import and photo browsing: newly imported photos appear in the grid as individual import jobs complete. The editor does not need to reload the page to see them (the existing photo upload notification mechanism handles new-photo display; if it does not, the editor can reload).

**Access control:**
- The `nextcloud-import-progress` socket.io event is emitted only to the importing user's socket connections (via `notifyUser(userId, ...)`).
- The `GET /photos` server-side banner query only checks for imports where `user_id = req.session.userId`.
- No other user can see or interfere with another user's import progress.

**Test data:**
- An active import (row in `nextcloud_imports` with `done < total`) owned by the logged-in user — verify banner renders on page load.
- An import where jobs complete one by one — verify banner count increments in real time.
- An import where all jobs fail — verify failure banner message.
- An import where `done + failed = total` — verify no banner on page load.
- Two simultaneous imports — verify only the most recent one is shown.

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). socket.io is already in use for AI identification events — the same client-side socket connection is reused. The banner must not interfere with keyboard navigation on the photos page (it is appended at the top of the DOM, not overlaid on the grid).

> **Technical notes:**
>
> **socket.io event:** The existing `notifyUser(userId, payload)` function in `src/notifications.js` is used unchanged. The worker calls it (indirectly via `POST /internal/identification-result` on Instance-1) after updating the `nextcloud_imports` row. The payload shape:
> ```json
> {
>   "event": "nextcloud-import-progress",
>   "importId": 42,
>   "done": 7,
>   "total": 20,
>   "failed": 1
> }
> ```
>
> **Client-side listener** (in `src/public/photos.js` or a dedicated `nextcloud-import.js`):
> ```js
> socket.on('nextcloud-import-progress', ({ importId, done, total, failed }) => {
>   updateImportBanner(done, total, failed);
>   if (done + failed >= total) {
>     setTimeout(() => dismissBanner(), 5000);
>   }
> });
> ```
>
> **Server-side banner query** (in `GET /photos` handler in `src/routes/photos.js`):
> ```sql
> SELECT id, total, done, failed
> FROM nextcloud_imports
> WHERE user_id = $1
>   AND done + failed < total
> ORDER BY created_at DESC
> LIMIT 1;
> ```
> Pass the result to the template as `activeImport` (null if no row). The template renders the banner only when `activeImport` is non-null.
>
> **Worker progress update:** In the BullMQ job processor (Instance-2, `worker/src/worker.js`), after each successful or failed file:
> ```js
> const { rows: [imp] } = await db.query(
>   'UPDATE nextcloud_imports SET done = done + 1 WHERE id = $1 RETURNING done, total, failed',
>   [importId]
> );
> await instance1Api.post('/internal/nextcloud-import-progress', {
>   userId, importId, done: imp.done, total: imp.total, failed: imp.failed
> });
> ```
> Add `POST /internal/nextcloud-import-progress` to `src/routes/internal.js` (guarded by `requireWorkerSecret`). This handler calls `notifyUser(userId, { event: 'nextcloud-import-progress', ... })`.
>
> **No new migration needed for NC-5.** The `nextcloud_imports` table is created in `v12.sql` (NC-4).
>
> **Out of scope:** Email notification when import completes. Per-photo progress within the import (only aggregate counts). Persistent import history page. Import cancellation. Retry of failed individual files.

---

**US-NC6 — Faster Nextcloud import by downloading on Instance-1**
As an editor, when I import photos from Nextcloud, I want the download to happen immediately on the main instance rather than waiting for Instance-2 to unshelve, so the import starts faster and I see my photos sooner.

**Acceptance criteria:**

1. When `POST /photos/nextcloud-import/confirm` is called on Instance-1, instead of only enqueueing jobs to BullMQ for Instance-2, Instance-1 now downloads the photos directly from Nextcloud.
2. Instance-1 uploads each downloaded file to S3 using the existing `uploadToS3` mechanism (same as regular photo uploads).
3. Instance-1 inserts the photo record into the database (via `POST /internal/nextcloud-photo` or directly) with all metadata (user_id, filename, s3_key, nextcloud_url, tags, GPS coordinates, album membership).
4. After each photo is stored in S3 and DB, Instance-1 enqueues an AI identification job to the `identification` queue for Instance-2 to process asynchronously.
5. The `nextcloud_imports` row is updated with progress (done/failed counts) as each photo is successfully stored, matching the existing NC-5 progress reporting.
6. The socket.io progress events (`nextcloud-import-progress`) are emitted by Instance-1 as photos are downloaded and stored, not by Instance-2.
7. If Instance-2 is shelved when jobs are enqueued, it is automatically unshelved by `instance-lifecycle.js` (existing IV4-3 mechanism) to process the AI identification jobs.
8. The user sees photos appearing in their library as soon as they are downloaded and stored by Instance-1, without waiting for AI identification to complete.

**Error states:**
- Nextcloud download failure for a specific file: increment `failed` count, emit progress event, continue with next file.
- S3 upload failure: increment `failed` count, emit progress event, continue with next file.
- Database insert failure: increment `failed` count, emit progress event, continue with next file.
- All files fail: import row records the failure, banner shows "Import failed — 0 of N photos could be imported."

**Edge cases:**
- Instance-2 is down when AI jobs are enqueued: jobs remain in BullMQ queue and are processed when Instance-2 becomes available. Photos are already in S3 and visible to users.
- Network partition between Instance-1 and Instance-2: downloads and storage on Instance-1 succeed; AI jobs queue for later processing.
- Very large files (> 100MB): download and upload may take longer, but progress is still reported per-file.
- Instance-1 runs out of memory during download: the specific file fails, `failed` count is incremented, import continues with remaining files.

**Access control:**
- Same as NC-4: `POST /photos/nextcloud-import/confirm` is protected by `requireAuth` and `requireEditor`.
- All photos created are owned by `req.session.userId`.
- AI identification jobs are enqueued with the same user context.

**Test data:**
- Nextcloud folder with 3 JPEG files (basic happy path).
- Nextcloud folder with 1 large file (> 50MB) to test memory handling.
- Instance-2 shelved at start of import — verify Instance-1 can still download and store photos, and Instance-2 unshelves for AI processing.
- Network failure between Instance-1 and Nextcloud — verify failure handling and progress reporting.

**Browser/device support:** No change from NC-4; the UI remains the same, only the backend flow changes.

> **Technical notes:**
>
> **Architecture change:** The current flow (NC-4) has Instance-2 (worker) performing both download and AI identification. The new flow splits these: Instance-1 handles download+storage, Instance-2 handles AI only.
>
> **Download on Instance-1:** Reuse the existing `downloadFileAsBuffer` from `src/nextcloudWebdav.js` (already used by the `/internal/nextcloud-file` proxy). Call it directly from `POST /photos/nextcloud-import/confirm` handler in `src/routes/nextcloudImport.js`.
>
> **Sequential vs parallel downloads:** Download files sequentially (not in parallel) to avoid overwhelming Instance-1 memory. Each file: download → upload to S3 → insert DB row → enqueue AI job → emit progress.
>
> **Queue separation:** The `identification` queue (for AI processing) remains on Instance-2. The `nextcloud-import` queue (used in current NC-4 for download+AI) can be deprecated or repurposed.
>
> **Progress tracking:** The `nextcloud_imports` table and NC-5 progress banner mechanism remain unchanged. Instance-1 updates the `done` and `failed` counts directly.
>
> **AI job enqueueing:** After storing each photo, Instance-1 calls `addIdentificationJob({ photoId, userId })` from `src/queue/producer.js` to enqueue AI identification on Instance-2.
>
> **No new migration needed.** Reuses existing tables and endpoints.
>
> **Out of scope:** Changing the BullMQ queue structure. Changing the AI identification worker logic. Adding retry logic for failed downloads.
