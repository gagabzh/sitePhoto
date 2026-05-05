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
