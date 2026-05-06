# Human Test Plan

## Preconditions

- App is running (`docker compose up`)
- You are logged in as an admin (`saev.bzh@pm.me` / `changeme`)
- At least one other user exists for edit/delete/password tests

---

## Navigation — Avatar dropdown (DS-1)

**Steps:**
1. Log in as any role.

**Expected:**
- Top-right corner shows a circle containing your initial (e.g. `S`).
- Clicking it opens a small dropdown menu.
- **Editor / Viewer**: menu contains **Account** and a separator above **Logout**.
- **Admin**: menu contains **Account**, **Admin**, then a separator above **Logout**.
- Clicking anywhere outside the menu closes it.
- Clicking **Logout** logs you out and redirects to `/login`.

---

## Feature: User Management

### Preconditions
- Logged in as an admin.

---

### US-1 — View user list

**Steps:**
1. Click the avatar circle → **Admin**.

**Expected:**
- Page heading reads `the ledger.` (with italicised "ledger").
- A subtitle shows the total number of people and a short description.
- A table lists every user. Each row contains:
  - An avatar circle with the user's initial and their name + email beneath it.
  - A role chip — solid dark for `ADMIN`, blue for `EDITOR`, outlined for `VIEWER`.
  - A "joined" date (day month year format).
  - Action buttons (edit / password / delete) that are nearly invisible at rest and become fully visible on row hover.
- Your own row shows a `← you` tag next to your name and has no **Delete** button.
- A `+ New user` button appears in the page header.

---

### US-2 — Create a user

**Steps:**
1. Click avatar → **Admin** → click **+ New user**.
2. Fill in Name, Email, a password (min. 8 characters), and a Role.
3. Click **Create**.

**Expected:**
- You are redirected to the user list (the ledger).
- The new user appears as a row with the correct role chip.

**Edge cases:**
- Leave a field empty → browser blocks submission (required fields).
- Use an email already in use → error message "This email is already in use" appears on the form.

---

### US-3 — Edit a user

**Steps:**
1. Click avatar → **Admin** → hover a row → click **edit**.
2. Change the Name, Email, or Role.
3. Click **Save**.

**Expected:**
- You are redirected to the ledger.
- The updated values appear in the row.

**Edge cases:**
- Change the email to one already used by another user → error message appears.
- Edit your own account → the Role field is disabled; a note says "You cannot change your own role."

---

### US-4 — Delete a user

**Steps:**
1. Click avatar → **Admin** → hover a row that is not your own → click **delete**.
2. Confirm the browser confirmation dialog.

**Expected:**
- The user is removed from the ledger.

**Edge cases:**
- The **delete** action does not appear on your own row → you cannot delete yourself.

---

### US-5 — Admin resets a user's password

**Steps:**
1. Click avatar → **Admin** → hover a row → click **password**.
2. Enter a new password (min. 8 characters).
3. Click **Reset**.

**Expected:**
- A green success message appears: "Password updated successfully."
- Log out, then log back in as that user with the new password → login succeeds.

---

### US-6 — User changes their own password

**Steps:**
1. Click the avatar circle → **Account**.
2. Enter your current password.
3. Enter a new password (min. 8 characters).
4. Click **Update**.

**Expected:**
- A green success message appears: "Password updated successfully."
- Log out and log back in with the new password → login succeeds.

**Edge cases:**
- Enter a wrong current password → error message "Current password is incorrect" appears; password is not changed.

---

### User Management — access control

| Action | Admin | Editor | Viewer | Unauthenticated |
|---|---|---|---|---|
| View `/admin/users` | ✅ | ❌ 403 | ❌ 403 | ❌ → /login |
| Create / Edit / Delete user | ✅ | ❌ 403 | ❌ 403 | ❌ → /login |
| Change own password | ✅ | ✅ | ✅ | ❌ → /login |

---

## Feature: Photos (US-P1 to US-P4)

### Preconditions
- Logged in as an **editor** (or admin).
- At least one other editor account exists for ownership tests.

---

### Photo list — Family Wall (DS-2)

**Steps:**
1. Click **Photos** in the navigation bar.

**Expected:**
- A hero strip at the top shows the 4 most recent photos side-by-side.
- Below it, a mosaic wall groups photos in sets of 9, each set with a large featured cell (first position) followed by 8 smaller cells.
- A sidebar on the right shows: who has uploaded photos, the top tags, and the latest album.

---

### US-P1 — Upload a photo

**Steps:**
1. Click **Photos** → click **+ Upload**.
2. Choose an image file (JPEG, PNG, GIF or WebP).
3. Fill in a title and optional description.
4. Click **Upload**.

**Expected:**
- You are redirected to the photo detail page.
- The photo is displayed with its title and description.

**Edge cases:**
- Upload a non-image file (e.g. `.pdf`) → error "Only JPEG, PNG, GIF and WebP images are accepted."
- Upload a file larger than 10 MB → error "File is too large."
- Leave the title empty → browser blocks submission.

---

### US-P2 — Tag a photo

**Steps:**
1. On the upload form, enter tags in the Tags field, comma-separated (e.g. `Paris, John Doe`).
2. Click **Upload**.

**Expected:**
- Tags appear on the photo detail page as grey pills.
- Tags are stored in lowercase.

---

### US-P3 — Edit a photo

**Steps:**
1. Open a photo you own → click **Edit**.
2. Change the title, description, or tags.
3. Click **Save**.

**Expected:**
- You are redirected back to the photo detail page.
- Updated values are displayed.
- Removed tags no longer appear; new tags are shown.

**Edge cases:**
- Navigate to `/photos/:id/edit` for a photo owned by another editor → 403 error.
- Admin can edit any photo regardless of owner.

---

### US-P4 — Delete a photo

**Steps:**
1. Open a photo you own → click **Delete**.
2. Confirm the browser dialog.

**Expected:**
- You are redirected to the photo list.
- The photo no longer appears in the list.

**Edge cases:**
- POST to `/photos/:id/delete` for a photo owned by another editor → 403 error.
- Admin can delete any photo.
- Deleting a photo that doesn't exist → 404 error.

---

### Photo access control

| Action | Admin | Editor (owner) | Editor (other) | Viewer |
|---|---|---|---|---|
| View photo list `/photos` | ✅ | ✅ | ✅ | ❌ 403 |
| Upload photo | ✅ | ✅ | ✅ | ❌ 403 |
| View photo detail | ✅ | ✅ | ✅ | ✅ |
| Edit photo | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Delete photo | ✅ | ✅ | ❌ 403 | ❌ 403 |

---

## Feature: Albums (US-A1 to US-A3)

### Preconditions
- Logged in as an **editor** (or admin).
- At least one other editor account exists for ownership tests.
- At least two photos have been uploaded.

---

### Album list — Photo Books (DS-3)

**Steps:**
1. Click **Albums** in the navigation bar.

**Expected:**
- Each album appears as a "photo book" with a coloured ink spine on the left.
- The cover is 4:5 ratio, filled by the first photo in the album (or a "no photos yet" placeholder text if empty).
- A rotated label card shows the album title and creator.
- A ribbon badge in the corner shows the photo count (or `EMPTY` for albums with no photos).
- A dashed "new book" card at the end links to `+ New album`.

---

### US-A1 — Create an album

**Steps:**
1. Click **Albums** → click the dashed **+ New album** card (or the **+ New album** button).
2. Enter a title (required) and an optional description.
3. Click **Create**.

**Expected:**
- You are redirected to the album detail page.
- The album title and description are displayed.
- The album shows a "no photos yet" state.

**Edge cases:**
- Leave the title empty → browser blocks submission.

---

### Album detail — Inside an Album (DS-4)

**Steps:**
1. Click any album with at least one photo.

**Expected:**
- Left side shows a 320 px wide cover photo (first photo in the album).
- Right side shows: album title, description, photo count, contributor count, and action buttons (add photos, access, edit — for owners/admins only).
- Below the header, up to 9 photos appear in a 6-column mosaic where the first cell spans 3 columns × 2 rows, the second spans 2 × 2, and so on — creating a varied, editorial layout.
- If there are more than 9 photos, the remaining ones appear in a plain grid below the mosaic.

---

### US-A2 — Add photos to an album

**Steps:**
1. Open an album you own → click **+ Add photos**.
2. Click **+ Add** on one or more photos.

**Expected:**
- After each click you stay on the "Add photos" page.
- The added photo disappears from the available list.
- Go back to the album → the photo now appears in the mosaic/grid.

**Edge cases:**
- When all photos are already in the album, the page shows "All photos are already in this album."

---

### US-A2 — Remove a photo from an album

**Steps:**
1. Open an album you own that has at least one photo.
2. Click **Remove** under a photo and confirm the dialog.

**Expected:**
- The page reloads and the removed photo is no longer in the album.
- The photo still exists in the Photos list (removing from album does not delete the photo).

---

### US-A3 — Edit an album

**Steps:**
1. Open an album you own → click **Edit**.
2. Change the title and/or description.
3. Click **Save**.

**Expected:**
- You are redirected to the album detail page.
- Updated title and description are displayed.

**Edge cases:**
- Navigate to `/albums/:id/edit` for an album you do not own → 403 error.
- Admin can edit any album.

---

### US-A3 — Delete an album

**Steps:**
1. Open an album you own → click **Delete** and confirm the dialog.

**Expected:**
- You are redirected to the album list.
- The deleted album no longer appears.
- Photos that were in the album still exist in the Photos list.

**Edge cases:**
- POST to `/albums/:id/delete` for an album you do not own → 403 error.
- Admin can delete any album.

---

### Album access control

| Action | Admin | Editor (owner) | Editor (other) | Viewer |
|---|---|---|---|---|
| View album list `/albums` | ✅ | ✅ | ✅ | ❌ 403 |
| Create album | ✅ | ✅ | ✅ | ❌ 403 |
| View album detail | ✅ | ✅ | ✅ | ❌ 403 |
| Edit album | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Delete album | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Add photos to album | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Remove photo from album | ✅ | ✅ | ❌ 403 | ❌ 403 |

---

## Feature: Access Control (US-AC1, US-AC2)

### Album access — Access Vault (DS-5)

**Preconditions:**
- An album exists with at least one viewer already granted access and at least one viewer who has not yet been granted access.

**Steps:**
1. Open an album you own → click **Access**.

**Expected:**
- Page header reads "who can see [Album title]?" with a summary bar showing the album's access state ("private").
- Main panel lists current viewers, each on their own row with a **Revoke** button.
- Sidebar panel lists users who do not yet have access. Each candidate has their own inline **Grant access** button (no dropdown select).
- If all viewers already have access, the sidebar shows "All viewers already have access."

---

### US-AC1 — Grant viewer access

**Steps:**
1. On the Access Vault page, click **Grant access** next to a viewer who does not have access.

**Expected:**
- The page reloads.
- The viewer appears in the main "current viewers" list with a Revoke button.
- The viewer no longer appears in the sidebar candidates list.

---

### US-AC2 — Revoke viewer access

**Steps:**
1. On the Access Vault page, click **Revoke** next to a current viewer.

**Expected:**
- The page reloads.
- The viewer disappears from the main list and reappears in the sidebar candidates list.

---

## Feature: GPS & Map (US-GPS1 to US-GPS4)

### Preconditions
- At least two photos with GPS coordinates exist and belong to albums the viewer has access to.
- At least one photo has no GPS coordinates.

---

### Map page — Map First (DS-6)

**Steps:**
1. Click **Map** in the navigation bar.

**Expected:**
- The map fills the full viewport height.
- A 280 px sidebar on the left contains a filter form (album and tag dropdowns) and a list of albums with photo counts.
- Photos with GPS coordinates appear as pins or clusters on the map.

---

### US-GPS2 — View location on photo detail

**Steps:**
1. Open a photo that has GPS coordinates.

**Expected:**
- A small map is shown on the photo detail page indicating the location.

---

### US-GPS3 — Browse photos on the map

**Steps:**
1. Click **Map**.
2. Click a map pin (individual or cluster).

**Expected:**
- A photo strip overlay appears at the bottom of the map showing thumbnails and coordinates for the photo(s) at that pin.
- Clicking a thumbnail navigates to the photo detail page.

---

### US-GPS4 — Filter map by album or tag

**Steps:**
1. On the Map page, select an album or tag from the filter form and submit.

**Expected:**
- Only pins for photos matching that album or tag remain on the map.
- The sidebar list updates accordingly.
- A **Clear** option is available to remove the filter.

---

### Map access control

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View `/map` | ✅ all photos | ✅ all photos | ✅ shared-album photos only |

---

## Feature: Timeline (TL1–TL3)

### Preconditions

- At least three photos uploaded: two in the same month, one in a different month.
- At least one photo has a "Date taken" set to a past date different from its upload date.
- At least one album with photos exists and has been shared with a viewer account.
- At least one tag has been applied to a photo.

---

### Timeline page — Story layout (DS-7)

**Steps:**
1. Log in as an editor or admin.
2. Click **Timeline** in the navigation bar.

**Expected:**
- A large handwritten-style headline reads "everything we've seen together, in order."
- A stats block shows total photo count, number of people, and the year of the first photo.
- Each month appears as a row with: a dot on the timeline rail, a short "when" label (e.g. "now", "last mo.", or abbreviated month), the full month-year heading, a photo count and uploader list, and a variable-size photo grid (1–5 cells depending on how many photos that month has).
- Months appear in reverse-chronological order (most recent first).

---

### TL1 — View the timeline (editor/admin)

**Steps:**
1. Click **Timeline**.

**Expected:**
- Photos with a `taken_at` date are grouped under their month heading.
- Two photos from the same month appear under a single heading.
- Clicking a photo thumbnail navigates to the photo detail page.

---

### TL1 — Filter by album

**Steps:**
1. On the Timeline page, open the **Album** dropdown and select an album.
2. Click **Filter**.

**Expected:**
- Only photos belonging to that album are shown.
- The album dropdown shows the selected album as the active option.
- A **Clear** link appears next to the Filter button.
- Clicking **Clear** returns to the full unfiltered timeline.

---

### TL1 — Filter by tag

**Steps:**
1. On the Timeline page, open the **Tag** dropdown and select a tag.
2. Click **Filter**.

**Expected:**
- Only photos with that tag are shown.
- The tag dropdown shows the selected tag as the active option.
- A **Clear** link appears; clicking it restores the full timeline.

---

### TL2 — Viewer sees only accessible photos

**Steps:**
1. Log in as a viewer.
2. Click **Timeline**.

**Expected:**
- Only photos from albums explicitly shared with this viewer appear.
- Photos from unshared albums are not visible.
- The Album dropdown only lists albums the viewer has access to.
- The Tag dropdown only lists tags on photos the viewer can see.

---

### TL3 — Date taken drives timeline placement

**Steps:**
1. Upload a photo and set **Date taken** to a date in a past month (e.g. January 2023).
2. Navigate to the Timeline.

**Expected:**
- The photo appears under the "January 2023" heading.

3. Edit the photo and clear the **Date taken** field. Save.
4. Reload the Timeline.

**Expected:**
- The photo no longer appears in the Timeline at all (only photos with an explicit date are shown).

5. Upload a second photo without setting a Date taken.

**Expected:**
- The second photo does not appear in the Timeline.

---

### Timeline access control

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View `/timeline` | ✅ all photos | ✅ all photos | ✅ shared-album photos only |
| Filter by album | ✅ | ✅ | ✅ accessible albums only |
| Filter by tag | ✅ | ✅ | ✅ accessible tags only |
