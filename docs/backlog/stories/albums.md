# Albums

**[DONE] US-A1 — Create an album**
As an editor, I can create an album with a title and optional description. The cover photo is automatically set to the first photo added to the album.

**[DONE] US-A2 — Add / remove photos from an album**
As an editor, I can add or remove photos from my own albums. As an admin, I can do this on any album.

**[DONE] US-A3 — Edit / delete an album**
As an editor, I can edit the title and description of my own albums, or delete them. As an admin, I can edit or delete any album.

**[DONE] IMP-5 — One album per photo** ✓
As an editor, each photo belongs to at most one album. If I add a photo that is already in another album, it is moved to the new one. Photos not added to any album remain as standalone photos, visible in the photo list.

---

**[Backlog] MA-1 — A photo can belong to multiple albums**
As an editor, I can add any photo to more than one album, so I can organise photos into overlapping collections without duplicating them.

**Acceptance criteria:**

1. The `album_photos` join table (schema: `album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE, photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE, PRIMARY KEY (album_id, photo_id)`) is the authoritative data model. This table already exists as of migration `v6.sql`. The `photos.album_id` column was dropped by that migration. No further schema change is required for this story.
2. `POST /albums/:id/photos/add` accepts a JSON body `{ photoIds: [integer, ...] }` or a form body with multiple `photoId` values. For each `photoId` in the list, the server inserts a row `(album_id, photo_id)` using `INSERT INTO album_photos ... ON CONFLICT DO NOTHING`. Existing memberships are silently ignored.
3. `POST /albums/:id/photos/remove` accepts a JSON body `{ photoIds: [integer, ...] }`. For each `photoId`, the server deletes the row from `album_photos`. If a row does not exist (photo was not a member), the operation is a no-op. Removing a photo from an album does not delete the photo record — it remains visible in the photo list.
4. After removal, if the removed photo was the album cover (`albums.cover_photo_id = photo_id`), the cover is automatically updated to the photo with the smallest `photo_id` still in the album. If the album becomes empty, `cover_photo_id` is set to `NULL`.
5. The album detail page (`GET /albums/:id`) shows all photos whose IDs appear in `album_photos WHERE album_id = :id`, ordered by `photo_id ASC` (insertion order approximation). The total count shown in the header reflects the current membership count.
6. The photo list page (`GET /photos`) shows photos regardless of album membership — standalone photos (no membership) and multi-album photos all appear.
7. Both `POST /albums/:id/photos/add` and `POST /albums/:id/photos/remove` are protected by `requireEditor`. An admin can operate on any album; an editor can only operate on albums they own (`albums.user_id = req.session.userId`). Attempting to modify another user's album returns HTTP 403.
8. Both endpoints use `wrapAsync`. Unhandled DB errors return HTTP 500.
9. CSRF is validated on both endpoints via the `X-CSRF-Token` header. Invalid or missing token returns HTTP 403.
10. The "add photos" page (`GET /albums/:id/photos/add`) shows all photos the current user has access to, with checkboxes. Already-member photos are shown pre-checked.

**Error states:**
- Empty `photoIds` array: `POST /albums/:id/photos/add` returns HTTP 400 `{ "error": "No photo IDs provided" }`. Same for remove.
- Non-integer or negative `photoId` values: rejected with HTTP 400 `{ "error": "Invalid photo ID" }`.
- `photo_id` does not exist in the `photos` table: `INSERT ... ON CONFLICT DO NOTHING` silently skips it (the FK constraint will reject it — catch and return HTTP 404 `{ "error": "Photo not found" }`).

**Edge cases:**
- Adding a photo to an album it already belongs to: silently succeeds (no duplicate row, no error).
- Adding a photo to multiple albums simultaneously: two separate `POST /albums/:id/photos/add` calls, both succeed.
- Removing the last photo from an album: album remains (not auto-deleted); it shows as empty.
- Deleting an album (`POST /albums/:id/delete`): `ON DELETE CASCADE` in `album_photos` removes all membership rows automatically.
- Deleting a photo (`POST /photos/:id/delete`): `ON DELETE CASCADE` in `album_photos` removes all membership rows for that photo automatically.

**Access control:** `requireEditor` enforces both add and remove. Album ownership check (`albums.user_id = req.session.userId`) applies to editors; admins bypass ownership check via `requireAdmin || isOwner` pattern already used in `albums.js`.

**Test data:** Create 3 albums and 10 photos. Add photos 1–5 to album A. Add photos 3–7 to album B. Verify: photo 3 appears in both albums, photo 1 only in A, photo 6 only in B. Delete photo 3 from album A; verify it remains in album B. Delete album A; verify photos still exist.

**Browser/device support:** Desktop + mobile. The add/remove form uses standard `<form>` + `<input type="checkbox">` with a JavaScript `fetch` enhancement for the bulk action (same pattern as the existing bulk-remove in `albums.js`).

> **Technical notes:**
>
> The `album_photos` table already exists (migration `v6.sql`). **No new migration needed.**
>
> The existing `POST /albums/:id/photos/add` and `POST /albums/:id/photos/remove` routes in `src/routes/albums.js` may still reference `photos.album_id`. Audit those routes: replace any `UPDATE photos SET album_id = ...` or `UPDATE photos SET album_id = NULL` with `INSERT INTO album_photos` / `DELETE FROM album_photos`.
>
> Cover photo update query (after remove):
> ```sql
> UPDATE albums
> SET cover_photo_id = (
>   SELECT photo_id FROM album_photos WHERE album_id = $1 ORDER BY photo_id ASC LIMIT 1
> )
> WHERE id = $1;
> ```
>
> Audit `src/routes/albums.js` line by line for any remaining `album_id` column reference on `photos`. The `init-db.sql` snapshot may also reference `photos.album_id` — update it to match the current schema.

---

**[Backlog] MA-2 — Photo detail shows album memberships**
As a logged-in user, on a photo's detail page I can see the list of albums the photo belongs to as clickable links, so I can navigate to any of those albums directly.

**Acceptance criteria:**

1. On `GET /photos/:id`, a section titled "albums" (or equivalent label) appears below the photo metadata. It lists every album the photo belongs to, derived from `SELECT a.id, a.title FROM albums a JOIN album_photos ap ON ap.album_id = a.id WHERE ap.photo_id = $1 ORDER BY a.title ASC`.
2. Each album is rendered as a link `<a href="/albums/[id]">[title]</a>`.
3. A viewer only sees albums they have been granted access to (`album_access` check). Albums they are not granted access to are excluded from the list even if the photo is a member.
4. An editor sees only albums they own. An admin sees all albums the photo belongs to.
5. If the photo belongs to no albums, the section shows `not in any album` in a muted style. The section is always present (not hidden when empty) so there is no layout shift when the first album is added.
6. The albums list is rendered server-side on the initial page load. No separate API call is required.
7. On mobile (viewport < 600 px), the albums list renders as a vertical stack of links with adequate tap targets (min 44px height per link).

**Error states:**
- DB query failure: the photo detail page still renders; the albums section shows `could not load albums` in a muted style and logs the error server-side.

**Edge cases:**
- Photo in 1 album: one link rendered.
- Photo in 10 albums: all 10 links rendered (no pagination needed at family scale).
- Album title is 255 characters (max): link text truncated with `text-overflow: ellipsis; overflow: hidden; max-width: 280px` on mobile.
- Viewer has access to 2 of 3 albums containing the photo: only 2 links shown.

**Access control:** Viewers see only albums they have explicit access to. Editors see only their own albums. Admins see all. The `GET /photos/:id` route already enforces photo-level access — this criterion adds album-level filtering within that same route.

**Test data:** Photo belonging to 0 albums, 1 album, 3 albums. Viewer account with access to 2 of those 3 albums. Confirm the viewer sees 2 links, not 3.

**Browser/device support:** Desktop + mobile.

> **Technical notes:**
>
> Modify `fetchPhotoWithTags` (or the equivalent query used by `GET /photos/:id`) in `src/repositories/photos.js` to add a parallel query:
> ```sql
> SELECT a.id, a.title
> FROM albums a
> JOIN album_photos ap ON ap.album_id = a.id
> WHERE ap.photo_id = $1
>   AND (
>     $2 = 'admin'
>     OR (a.user_id = $3)  -- editor sees own albums
>     OR EXISTS (          -- viewer sees shared albums
>       SELECT 1 FROM album_access aa
>       WHERE aa.album_id = a.id AND aa.viewer_id = $3
>     )
>   )
> ORDER BY a.title ASC;
> -- $1 = photoId, $2 = role, $3 = userId
> ```
>
> Pass the resulting array to `renderPhotoDetailPage` as `photoAlbums`. Render in the detail template.

---

**[Backlog] MA-3 — Manage album memberships from the photo edit form**
As an editor, on the photo edit page I can add the photo to additional albums or remove it from existing ones, so I can curate membership from the photo's own page without navigating album by album.

**Acceptance criteria:**

1. On `GET /photos/:id/edit`, an "Albums" section appears below the tags section. It shows a checklist of all albums owned by the current editor (or all albums for admin), with checkboxes.
2. Albums the photo already belongs to are shown pre-checked. Albums the photo does not belong to are unchecked.
3. Submitting the edit form with a changed set of album checkboxes sends a `POST /photos/:id/edit` (or the existing form action). The server reconciles the new membership set:
   - Albums checked but not previously a member: `INSERT INTO album_photos (album_id, photo_id)`.
   - Albums unchecked but previously a member: `DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2`.
   - Albums with unchanged state: no DB write.
4. The reconciliation runs inside the same DB transaction as the photo title/description/tags update. If any part fails, the entire update rolls back.
5. After a successful save, the server redirects to `GET /photos/:id` (or back to the album if `?from=/albums/:id` was set). The album memberships are updated immediately on the next page load.
6. An editor can only manage memberships for their own albums. Albums owned by other users do not appear in the checklist. If an editor is a member of a photo via another editor's album (edge case: admin-added), that membership row is preserved even if it does not appear in the editor's checklist.
7. An admin sees all albums across all users in the checklist and can manage any membership.
8. The checklist is scrollable if there are more than 10 albums (CSS `max-height: 240px; overflow-y: auto` on the checklist container).
9. If the editor has no albums, the section shows "no albums yet — create one" with a link to `/albums/new`.

**Error states:**
- DB transaction failure: server returns HTTP 500. The photo edit page is re-rendered with an error banner "Save failed — please try again." All form fields retain their submitted values.
- `album_id` in the submitted checklist does not belong to the current user (tampered form): server ignores unknown album IDs silently (the ownership check in the DB query filters them out).

**Edge cases:**
- Photo moved out of all albums: becomes a standalone photo. No DB error.
- Editor adds photo to 5 albums in one save: 5 insert rows created in the same transaction.
- Race condition — another editor adds the same photo to an album between the page load and the form submit: `INSERT ... ON CONFLICT DO NOTHING` handles the duplicate gracefully; no error is thrown.
- Album deleted between page load and form submit: the corresponding checkbox no longer matches a valid album; the server silently skips it (FK constraint catches it — return HTTP 400 for that specific album ID, still save other changes).

**Access control:** `requireEditor` on `GET /photos/:id/edit` and the edit POST handler. Ownership of albums is verified server-side via `WHERE user_id = $1` on the albums query. Admin bypasses ownership check.

**Test data:** Editor with 3 albums. Photo currently in albums 1 and 2. Edit page: verify albums 1 and 2 are pre-checked, album 3 is unchecked. Uncheck album 1, check album 3, submit. Verify: photo is now in albums 2 and 3 only.

**Browser/device support:** Desktop + mobile. Checklist uses `<input type="checkbox" name="albums[]" value="[id]">` — standard HTML, no JS required.

> **Technical notes:**
>
> The `POST /photos/:id/edit` handler is in `src/routes/photos.js`. Wrap the membership reconciliation in a `BEGIN` / `COMMIT` transaction using `db.query('BEGIN')` / `db.query('COMMIT')` with a `ROLLBACK` on error (same pattern as the bulk delete in `albums.js`).
>
> Fetch the current membership set before rendering the edit form:
> ```sql
> SELECT album_id FROM album_photos WHERE photo_id = $1;
> ```
>
> Fetch available albums for the checklist:
> ```sql
> SELECT id, title FROM albums WHERE user_id = $1 ORDER BY title ASC;
> -- For admin: SELECT id, title FROM albums ORDER BY title ASC LIMIT 100;
> ```
>
> The reconciliation diff:
> ```js
> const currentSet  = new Set(currentMemberships.map(r => r.album_id));
> const submittedSet = new Set((req.body.albums || []).map(Number));
> const toAdd    = [...submittedSet].filter(id => !currentSet.has(id));
> const toRemove = [...currentSet].filter(id => !submittedSet.has(id));
> ```
>
> Only add albums that are owned by the current user (or all for admin) — never trust raw form values for ownership.

---

**[Backlog] ALB-1 — Click-to-edit in album, explicit lightbox button**
As an editor or admin browsing an album, clicking a photo thumbnail opens the photo edit page, and a separate visible lightbox icon on the thumbnail opens the fullscreen viewer — so editing is one click away and the lightbox remains accessible. As a viewer, clicking a photo thumbnail opens the lightbox (unchanged).

**Acceptance criteria:**

1. On the album detail page (`GET /albums/:id`), each photo thumbnail is wrapped in an `<a href="/photos/[id]/edit?from=/albums/[id]">` for editors and admins. Clicking anywhere on the thumbnail (except the lightbox icon) navigates to the edit page.
2. Each thumbnail has a visible lightbox icon button (class `.lb-btn`, aria-label: "View fullscreen"): positioned `top: 6px; right: 6px; position: absolute` inside the `.photo-thumb-wrap` container. Icon: the `⊞` glyph in a 24×24 circle. On hover, the icon scales slightly (`transform: scale(1.1)`). Clicking the icon opens the lightbox viewer (story LB-1) without navigating away.
3. Viewers (`role === 'viewer'`) see no lightbox icon button. For viewers, clicking the thumbnail opens the lightbox directly (existing behaviour). The `<a>` wrapping the thumbnail resolves to the lightbox trigger (`data-lightbox` or equivalent), not the edit page.
4. Role determination for the thumbnail template is server-side: the `canEdit` flag (already computed per photo in `renderAlbumPage`) controls which link and icon are rendered. No client-side role check.
5. On mobile (viewport < 600 px), the lightbox icon tap target is extended to minimum 44×44 px via padding or a `::before` pseudo-element.
6. Keyboard navigation: the thumbnail link is focusable with Tab. The lightbox icon is a separate focusable `<button>` reachable with Tab after the thumbnail link. Enter on the icon opens the lightbox.

**Error states:**
- Navigating to `/photos/:id/edit` with `?from=/albums/:id` where the album no longer exists: the back button in the edit page falls back to `/albums` (the album list). This is handled by the `parseFrom` function already in `photos.js` — the regex validates the URL before trusting it.

**Edge cases:**
- Admin browsing an album they don't own: they see the edit link (admin can edit any photo via `canEdit` check).
- Photo that has been deleted between album load and thumbnail click: edit page returns 404 in the normal photo error flow.
- Album with 1 photo: the single thumbnail shows the lightbox icon at top-right without layout issues.

**Access control:** Edit link only rendered when `canEdit === true` (editor owns the photo, or admin). Lightbox icon rendered for all roles (but for viewers, the thumbnail link itself is the lightbox trigger — no separate edit link). Server-side determination only; no client-side DOM modification.

**Test data:** Admin, editor (album owner), and viewer accounts. Album with 5 photos. Verify: admin sees edit link + lightbox icon; editor (owner) sees edit link + lightbox icon; viewer sees lightbox-only thumbnail link with no edit affordance.

**Browser/device support:** Desktop + mobile. The lightbox icon uses a Unicode glyph from the approved set (see LB-1).

> **Technical notes:**
>
> Modify the album detail template in `src/routes/albums.js` (or the view helper it calls). The `canEdit` boolean is already computed per photo in the album detail query — use it to choose the link target and whether to render the `.lb-btn` icon.
>
> The `?from=/albums/[id]` query parameter is already parsed by `parseFrom` in `src/routes/photos.js`. Verify the regex `/^\/albums\/\d+$/` covers the album URL pattern — it does.
>
> The lightbox icon `<button>` must call `event.preventDefault()` and `event.stopPropagation()` to prevent the parent `<a>` from triggering when the icon is clicked. Use a `data-photo-id` attribute on the button to pass the photo ID to the lightbox JS.
>
> Lightbox implementation details are in story LB-1.

---

**[Backlog] ALB-2 — Context-aware back button on photo detail and edit pages**
As a logged-in user, when I navigate to a photo's detail or edit page from a specific context (an album, a travel, or the photos list), the back button returns me to that context — so I do not lose my place in the collection.

**Acceptance criteria:**

1. When navigating from an album detail page to a photo detail or edit page, the album detail page appends `?from=/albums/[id]` to the photo URL. Example: `<a href="/photos/42?from=/albums/7">`.
2. When navigating from the photos list (`/photos`) to a photo detail or edit page, the link appends `?from=/photos`.
3. When navigating from a travel page (`/travels/[slug]`) to a photo detail or edit page, the link appends `?from=/travels/[slug]`.
4. On `GET /photos/:id` and `GET /photos/:id/edit`, the server reads `req.query.from` and passes it through `parseFrom()` (already implemented in `src/routes/photos.js`). The validated `from` value is embedded in the back button's `href`. If `from` is absent or invalid, the back button links to `/photos` (the default fallback).
5. The back button appears at the **top** of the photo detail and photo edit pages (not only at the bottom — see IMP-3, which is done). Its label is context-aware:
   - `from = /albums/[id]`: label `← back to album`.
   - `from = /photos`: label `← back to photos`.
   - `from = /travels/[slug]`: label `← back to travel`.
   - No `from` or invalid: label `← back to photos`.
6. The `from` parameter is preserved when the edit page's "View" link navigates to the detail page and vice versa. Example: edit page `Cancel` button should also carry `?from=` if it was passed in.
7. The `from` parameter is propagated through the delete flow: `POST /photos/:id/delete` redirects to the `from` URL (if valid) after deletion, not always to `/photos`.
8. The `parseFrom` function in `src/routes/photos.js` validates the parameter against the regex `/^\/photos$|^\/albums\/\d+$|^\/travels\/[a-z0-9-]+$/`. Any `from` value that does not match is treated as if absent.

**Error states:**
- Tampered `from` parameter (e.g. `from=https://evil.com`): `parseFrom` rejects it; back button defaults to `/photos`. No open redirect.
- Album referenced in `from` has been deleted: the user is redirected to `/albums` (the list) instead — catch the 404 on the album page and show an info banner "The album no longer exists."

**Edge cases:**
- User opens photo edit from an album, then saves and is redirected back: the redirect target is the same `?from` URL, so the user returns to the album (not `/photos`).
- Multiple browser tabs: each tab's back-button link is independent; the `from` parameter is per-request, not stored in session.
- Photo detail opened directly (no `from`): back button shows `← back to photos` pointing to `/photos`.

**Access control:** The `from` parameter is used only as a redirect target after validation. No access control implications — the destination page enforces its own auth.

**Test data:** Log in as editor. Navigate: `/albums/3` → click photo → verify URL is `/photos/42?from=/albums/3` → verify back button label is `← back to album` → click back → verify return to `/albums/3`. Repeat from `/photos` context. Repeat delete flow.

**Browser/device support:** Desktop + mobile. All links are standard `<a>` elements with `href`. No JavaScript required for basic functionality; JS enhances the delete flow redirect only.

> **Technical notes:**
>
> `parseFrom` already exists in `src/routes/photos.js` and validates three URL patterns. Verify the travel slug pattern `/^\/travels\/[a-z0-9-]+$/` matches the actual travel slug format used in `travels.slug` (migration `v7.sql`: slugs are lowercase alphanumeric + hyphens).
>
> In album detail template: change photo thumbnail links from `/photos/[id]` to `/photos/[id]?from=/albums/[id]` (album's ID, not photo's). Similarly, the "Edit" button inside the album detail photo row (if present) should carry the `?from=` parameter.
>
> In photos list template: change `<a href="/photos/[id]">` to `<a href="/photos/[id]?from=/photos">`.
>
> The delete handler (`POST /photos/:id/delete`) receives `from` as a POST body field (add a hidden `<input name="from" value="[from]">` in the delete confirmation form). After deletion, do `res.redirect(parseFrom(req.body.from) || '/photos')`.
>
> Cancel/view links on the edit page: pass `from` as a query parameter in the `href` of the Cancel and View buttons.

---

**[Backlog] RA-1 — Create a snapshot album from a tag recipe**
As an editor, on the tag combinator page I can select a saved recipe and click "Create album from recipe", give the album a name, and create a new album containing all photos that currently match the recipe — so I can save a curated set without manually selecting each photo.

> **Implementation note:** The `📁` button appears on every recipe row in the sidebar. Recipes with no filters are rejected by the API (422). These are intentional deviations from the original spec.

**Acceptance criteria:**

1. On the tag combinator page (`GET /tags`), each recipe row in the sidebar has a "Create album" button (glyph `[+]` or `⊞`, aria-label: "Create album from recipe") alongside the existing load and delete controls.
2. Clicking "Create album" on a recipe row opens an inline input field (or a small modal) prompting for an album name. The input is pre-filled with the recipe name as a suggested title.
3. The user types a name and confirms. The client sends `POST /albums/from-recipe` with body `{ recipeId: [id], albumName: "[name]" }`.
4. The server validates:
   - `recipeId` must exist in `tag_recipes` and belong to `req.session.userId` (or the user is admin).
   - `albumName` must be 1–255 characters (non-empty after trimming). Returns HTTP 422 `{ "error": "Album name is required" }` if blank.
   - The recipe must have at least one filter (non-empty `query_json`). Returns HTTP 422 `{ "error": "Recipe has no filters — cannot create an empty album" }` if `query_json` is empty or null.
5. The server resolves which photos match the recipe at the time of the request. It uses the same tag-filter query that the tag combinator page uses to display matching photos. The matching photos are inserted into the new album in a single transaction:
   a. `INSERT INTO albums (user_id, title, created_at) VALUES ($1, $2, NOW()) RETURNING id`.
   b. `INSERT INTO album_photos (album_id, photo_id) SELECT [newAlbumId], id FROM photos WHERE [recipe filter conditions]`.
   c. Set `cover_photo_id` to the `MIN(photo_id)` from the matching set (or `NULL` if empty).
6. The endpoint returns HTTP 201 `{ "albumId": [id], "photoCount": N }` on success.
7. On success, the client shows an inline confirmation: "Album '[name]' created with N photos. View album →" where "View album →" is a link to `/albums/[id]`.
8. If the recipe matches 0 photos, the album is still created (empty album). The confirmation shows "Album '[name]' created — no photos matched at this time."
9. If the recipe matches more than 500 photos, the server still creates the album with all matching photos. There is no cap (family scale). A response header `X-Photo-Count: N` echoes the count for logging purposes.
10. `POST /albums/from-recipe` is protected by `requireEditor`. Unauthenticated requests return HTTP 401.
11. `POST /albums/from-recipe` validates CSRF via `X-CSRF-Token`. Invalid token returns HTTP 403.
12. `POST /albums/from-recipe` uses `wrapAsync`. DB errors return HTTP 500 with `{ "error": "Could not create album — please try again." }`.

**Error states:**
- `recipeId` not found or not owned by user: HTTP 404 `{ "error": "Recipe not found" }`.
- `albumName` empty or whitespace-only: HTTP 422 `{ "error": "Album name is required" }`.
- Recipe has no filters: HTTP 422 `{ "error": "Recipe has no filters — cannot create an empty album" }`.
- DB transaction failure: HTTP 500. Neither the album nor membership rows are created.
- Network timeout: client shows "Could not create album — please try again."

**Edge cases:**
- Recipe matches 0 photos: album created, empty. Count shown as 0 in confirmation.
- Two concurrent requests with the same recipe and name: both succeed; two separate albums with the same name are created (no uniqueness constraint on album titles).
- Photo deleted between recipe resolution and insert: `INSERT INTO album_photos ... SELECT` query includes only existing photos — deleted photos won't appear. No error.
- Album name exactly 255 characters: accepted.
- Album name 256 characters: HTTP 422 `{ "error": "Album name must be 255 characters or fewer" }`.

**Access control:** Editor can create albums from their own recipes only. Admin can use any recipe. Viewer cannot access this endpoint (fails `requireEditor`).

**Test data:** Recipe with 1 filter matching 5 photos; recipe with 0 filters (should be rejected); recipe matching 0 photos. Confirm album rows and `album_photos` rows are created correctly.

**Browser/device support:** Desktop + mobile. The inline name input appears where the "Create album" button was; on mobile, minimum 44px tap target for the Create Album button.

> **Technical notes:**
>
> New route: `POST /albums/from-recipe` in `src/routes/albums.js`. Register it before `POST /albums/:id` so the literal `from-recipe` path is not captured by the `:id` segment.
>
> The recipe filter query lives in `query_json` on the `tag_recipes` table. Parse `query_json` using the same logic as the tag combinator's filter endpoint. The exact query format is determined by `GET /tags` — inspect `src/routes/tags.js` to reuse the `buildTagFilterQuery(queryJson)` helper (or equivalent).
>
> Transaction pattern (using the existing `db` pool):
> ```js
> await db.query('BEGIN');
> try {
>   const { rows: [album] } = await db.query(
>     'INSERT INTO albums (user_id, title, created_at) VALUES ($1, $2, NOW()) RETURNING id',
>     [userId, albumName]
>   );
>   await db.query(
>     `INSERT INTO album_photos (album_id, photo_id)
>      SELECT $1, id FROM photos WHERE [recipe conditions]
>      ON CONFLICT DO NOTHING`,
>     [album.id, ...recipeParams]
>   );
>   await db.query(
>     'UPDATE albums SET cover_photo_id = (SELECT MIN(photo_id) FROM album_photos WHERE album_id = $1) WHERE id = $1',
>     [album.id]
>   );
>   await db.query('COMMIT');
> } catch (err) {
>   await db.query('ROLLBACK');
>   throw err;
> }
> ```
>
> Check `src/routes/tags.js` to confirm whether `cover_photo_id` exists as a column on `albums`. If not, skip the cover update step and note as a `/* TODO: cover_photo_id column */` comment.

---

**[Backlog] LB-1 — Lightbox / fullscreen viewer in album**
As a logged-in user browsing an album, I can click any photo thumbnail to open it in a fullscreen overlay, navigate between photos with arrow keys or on-screen buttons, and close with Escape or a close button — so I can view photos without leaving the album page.

**Acceptance criteria:**

1. On the album detail page (`GET /albums/:id`), each photo thumbnail (for viewers: the thumbnail link itself; for editors/admins: the explicit lightbox button per ALB-1) triggers the lightbox when activated.
2. The lightbox overlay (`<div id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">`) covers the full viewport with a semi-transparent background (`background: rgba(26,24,20,0.92)`). It sits above all other content (`z-index: 1000`).
3. The full-size photo is displayed centred in the overlay. The `<img>` has `max-width: 90vw; max-height: 86vh; object-fit: contain`. The overlay background fills the rest of the viewport.
4. A close button (`<button class="lb-close" aria-label="Close">`) is positioned `top: 16px; right: 16px`. Glyph: `✕`. Clicking the close button or pressing Escape closes the lightbox.
5. A "previous" button (`<button class="lb-prev" aria-label="Previous photo">`) with glyph `←` is positioned at `left: 16px; top: 50%`. A "next" button (`<button class="lb-next" aria-label="Next photo">`) with glyph `→` is positioned at `right: 16px; top: 50%`.
6. Pressing the left arrow key navigates to the previous photo. Pressing the right arrow key navigates to the next photo. The order matches the order of thumbnails on the album page (same `ORDER BY` as the album query).
7. At the first photo in the album, the "previous" button is disabled (`disabled` attribute, muted appearance). At the last photo, the "next" button is disabled.
8. The photo caption (title) is shown below the image in the overlay: `font-family: 'Caveat', cursive; font-size: 18px; text-align: center; color: var(--paper); margin-top: 8px`.
9. When the lightbox is open, page scroll is locked (`overflow: hidden` on `body`). When it closes, scroll is restored.
10. The photo URLs used by the lightbox are the same as those used for thumbnail display (existing `GET /photos/:id` or the S3-backed thumb endpoint). No separate full-size endpoint is required — the album detail page already carries all photo IDs and URLs needed to populate the lightbox.
11. The lightbox is implemented in vanilla JavaScript (no external library). A single `<script>` block on the album page handles open, close, prev, next, and keyboard events.
12. The lightbox is only available on the album detail page (`GET /albums/:id`). It is not required on the photo list page or other pages in this story.
13. On mobile (viewport < 600 px), the prev/next buttons are large (`width: 48px; height: 48px`) and positioned at the bottom of the overlay (`bottom: 20px; left/right: 20px`). Swipe gestures are not required in this story.

**Error states:**
- Image fails to load (S3 error or deleted photo): the lightbox shows a placeholder with muted text "Photo unavailable". The `onerror` attribute on `<img>` triggers the fallback.
- Album has exactly 1 photo: lightbox opens with both prev and next buttons disabled.

**Edge cases:**
- Album with 0 photos: lightbox cannot be triggered (no thumbnails present). No defensive code needed.
- Album with 1 photo: prev and next disabled (criterion 7).
- Keyboard focus trap: while the lightbox is open, Tab cycles through close/prev/next buttons only. Focus returns to the triggering thumbnail when the lightbox closes.
- Open in browser without CSS custom properties: all `var()` tokens fall back to their computed value — no JS dependency on CSS tokens.
- Two lightboxes open simultaneously (two albums tabs): each album page manages its own lightbox instance independently.

**Access control:** The lightbox requires no additional access check beyond what `GET /albums/:id` already enforces. Viewers can open the lightbox for any album they have been granted access to. Editors open the lightbox via the explicit `.lb-btn` icon (ALB-1).

**Test data:** Album with 1 photo, album with 3 photos, album with 20 photos. Verify keyboard navigation, Escape close, and disabled button states. Test on iOS Safari (no back/forward swipe conflict).

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). The `<dialog>` element is not used (use a plain `<div role="dialog">`  for broader compatibility). The keyboard event listener targets `document` while the lightbox is open.

> **Technical notes:**
>
> All photo data needed for the lightbox (IDs, title, thumbnail URL, full-size URL) is already available on the album detail page as the server renders the thumbnails. Emit the photo list as a JSON array in a `<script>` tag:
> ```html
> <script>
> const LB_PHOTOS = [
>   { id: 42, title: "Sunset", src: "/photos/42/image" },
>   ...
> ];
> </script>
> ```
> The `LB_PHOTOS` array must be serialised with `JSON.stringify` before embedding in the `<script>` block — do NOT use `esc()` or string interpolation in script context (user-supplied photo titles injected via string concatenation would allow XSS).
>
> The lightbox JS reads `LB_PHOTOS` to know the full ordered list. On thumbnail click (viewer) or `.lb-btn` click (editor), find the index in `LB_PHOTOS` by `data-photo-id` attribute, then render the overlay.
>
> Full-size image URL: use the existing route that serves photo files (check `src/routes/photos.js` for the pattern — likely `GET /photos/:id/image` or a presigned S3 redirect). If the full-size image is too large for the lightbox, add a `?size=large` query parameter to request a scaled version (deferred — use full size for V1).
>
> Focus trap: when lightbox opens, `document.addEventListener('keydown', handler)`. When it closes, `document.removeEventListener('keydown', handler)`. Store the triggering element in a variable and call `.focus()` on it when the lightbox closes.
>
> No new routes. No schema changes. CSS additions to `public/style.css` under `/* ── Lightbox ── */`.
