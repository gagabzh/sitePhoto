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

## Access control checks

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
