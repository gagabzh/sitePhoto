# Human Test Plan — User Management

## Preconditions

- App is running (`docker compose up`)
- You are logged in as an admin (`saev.bzh@pm.me` / `changeme`)
- At least one other user exists for edit/delete/password tests

---

## US-1 — View user list

**Steps:**
1. Click **Users** in the navigation bar.

**Expected:**
- Page shows a table with columns: Name, Email, Role, Created, Actions.
- Your own account appears in the list.
- Each row has Edit, Password, and Delete buttons (Delete is absent on your own row).

---

## US-2 — Create a user

**Steps:**
1. Go to **Users** → click **+ New user**.
2. Fill in Name, Email, a password (min. 8 characters), and a Role.
3. Click **Create**.

**Expected:**
- You are redirected to the user list.
- The new user appears in the table with the correct role.

**Edge cases:**
- Leave a field empty → browser blocks submission (required fields).
- Use an email already in use → error message "This email is already in use" appears on the form.

---

## US-3 — Edit a user

**Steps:**
1. Go to **Users** → click **Edit** on any user.
2. Change the Name, Email, or Role.
3. Click **Save**.

**Expected:**
- You are redirected to the user list.
- The updated values appear in the table.

**Edge cases:**
- Change the email to one already used by another user → error message appears.
- Edit your own account → the Role field is disabled and cannot be changed.

---

## US-4 — Delete a user

**Steps:**
1. Go to **Users** → click **Delete** on a user that is not your own account.
2. Confirm the browser confirmation dialog.

**Expected:**
- The user is removed from the list.

**Edge cases:**
- The **Delete** button does not appear on your own row → you cannot delete yourself.

---

## US-5 — Admin resets a user's password

**Steps:**
1. Go to **Users** → click **Password** on any user.
2. Enter a new password (min. 8 characters).
3. Click **Reset**.

**Expected:**
- A green success message appears: "Password updated successfully."
- Log out, then log back in as that user with the new password → login succeeds.

---

## US-6 — User changes their own password

**Steps:**
1. Click **My account** in the navigation bar.
2. Enter your current password.
3. Enter a new password (min. 8 characters).
4. Click **Update**.

**Expected:**
- A green success message appears: "Password updated successfully."
- Log out and log back in with the new password → login succeeds.

**Edge cases:**
- Enter a wrong current password → error message "Current password is incorrect" appears, password is not changed.

---

---

## Feature: Photos (US-P1 to US-P4)

### Preconditions
- Logged in as an **editor** (or admin).
- At least one other editor account exists for ownership tests.

---

### US-P1 — Upload a photo

**Steps:**
1. Click **Photos** in the navigation bar → click **+ Upload**.
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

**Also test editing tags (see US-P3).**

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
- Try to navigate to `/photos/:id/edit` for a photo owned by another editor → 403 error.
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
- Try to POST to `/photos/:id/delete` for a photo owned by another editor → 403 error.
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

### US-A1 — Create an album

**Steps:**
1. Click **Albums** in the navigation bar → click **+ New album**.
2. Enter a title (required) and an optional description.
3. Click **Create**.

**Expected:**
- You are redirected to the album detail page.
- The album title and description are displayed.
- The album shows "No photos yet. Add some."

**Edge cases:**
- Leave the title empty → browser blocks submission.

---

### US-A1 — View album list

**Steps:**
1. Click **Albums** in the navigation bar.

**Expected:**
- Each album shows a cover image (first photo added), title, photo count, and creator name.
- Albums you own (or all albums if admin) show **Edit** and **Delete** buttons.
- Albums owned by others do not show Edit/Delete buttons.

---

### US-A2 — Add photos to an album

**Steps:**
1. Open an album you own → click **+ Add photos**.
2. Click **+ Add** on one or more photos.

**Expected:**
- After each click you stay on the "Add photos" page.
- The added photo disappears from the available list.
- Go back to the album → the photo now appears in the grid.

**Edge cases:**
- When all photos are already in the album, the page shows "All photos are already in this album."

---

### US-A2 — Remove a photo from an album

**Steps:**
1. Open an album you own that has at least one photo.
2. Click **Remove** under a photo and confirm the dialog.

**Expected:**
- The page reloads and the removed photo is no longer in the album grid.
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
- Try navigating to `/albums/:id/edit` for an album you do not own → 403 error.
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
- Try POSTing to `/albums/:id/delete` for an album you do not own → 403 error.
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

## Timeline (TL1–TL3)

### Preconditions

- At least three photos uploaded: two in the same month, one in a different month.
- At least one photo has a "Date taken" set to a past date different from its upload date.
- At least one album with photos exists and has been shared with a viewer account.
- At least one tag has been applied to a photo.

---

### TL1 — View the timeline (editor/admin)

**Steps:**
1. Log in as an editor or admin.
2. Click **Timeline** in the navigation bar.

**Expected:**
- Photos are grouped under month headings (e.g. "March 2024").
- Months appear in reverse-chronological order (most recent first).
- Each photo card shows its thumbnail, title, and uploader.
- Clicking a photo card navigates to the photo detail page.
- Two photos from the same month appear under a single heading (not two separate headings).

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
- The photo appears under the "January 2023" heading, not under the current month.
3. Edit the photo and clear the **Date taken** field. Save.
4. Reload the Timeline.

**Expected:**
- The photo now appears under the month matching its upload date.

---

### Timeline access control

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View `/timeline` | ✅ all photos | ✅ all photos | ✅ shared-album photos only |
| Filter by album | ✅ | ✅ | ✅ accessible albums only |
| Filter by tag | ✅ | ✅ | ✅ accessible tags only |

---

## Access control checks — User Management

| Action | Admin | Editor | Viewer | Unauthenticated |
|---|---|---|---|---|
| View `/admin/users` | ✅ | ❌ 403 | ❌ 403 | ❌ → /login |
| Create/Edit/Delete user | ✅ | ❌ 403 | ❌ 403 | ❌ → /login |
| Change own password | ✅ | ✅ | ✅ | ❌ → /login |
| Access `/` | ✅ | ✅ | ✅ | ❌ → /login |

**Steps to verify access control:**
1. Create an editor user and a viewer user.
2. Log out, log in as each.
3. Try to navigate to `/admin/users` manually → you should see a 403 error.
4. Try `/account/password` → it should work for all roles.
