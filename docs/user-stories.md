# User Stories

---

## Feature: User Management

**US-1 — View user list**
As an admin, I can see the list of all users (name, email, role, creation date) so I know who has access to the site.

**US-2 — Create a user**
As an admin, I can create a user by filling in their name, email, password, and role, so I can grant access to new people.

**US-3 — Edit a user**
As an admin, I can edit a user's name, email, and role, so I can keep information up to date or adjust permissions.

**US-4 — Delete a user**
As an admin, I can delete a user so I can revoke access when needed.

**US-5 — Reset a user's password (admin side)**
As an admin, I can set a new password for any user, so I can help someone locked out of their account.

**US-6 — Change my own password**
As a logged-in user, I can change my own password by confirming my current password, so I can keep my account secure.

---

## Feature: Photos

**US-P1 — Upload a photo**
As an editor, I can upload a photo with a title and optional description, so I can add content to the site.

**US-P2 — Tag a photo**
As an editor, I can add tags (places, people) to a photo at upload time or later, so it can be found by browsing.

**US-P3 — Edit a photo**
As an editor, I can update the title, description, and tags of my own photos after upload. As an admin, I can edit any photo.

**US-P4 — Delete a photo**
As an editor, I can delete my own photos. As an admin, I can delete any photo.

---

## Feature: Albums

**US-A1 — Create an album**
As an editor, I can create an album with a title and optional description. The cover photo is automatically set to the first photo added to the album.

**US-A2 — Add / remove photos from an album**
As an editor, I can add or remove photos from my own albums. As an admin, I can do this on any album.

**US-A3 — Edit / delete an album**
As an editor, I can edit the title and description of my own albums, or delete them. As an admin, I can edit or delete any album.

---

## Feature: Access Control

**US-AC1 — Grant viewer access to an album**
As an editor, I can give specific viewers access to one of my albums, so only authorised people can see it.

**US-AC2 — Revoke viewer access**
As an editor, I can remove a viewer's access to one of my albums.

---

## Feature: Browsing (Viewer)

**US-V1 — Browse albums**
As a viewer, I can see the list of albums I have been granted access to, each showing its cover photo, title, and description.

**US-V2 — View album content**
As a viewer, I can open an album I have access to and browse all its photos.

**US-V3 — Browse by tag**
As a viewer, I can browse photos by tag, and only see photos that belong to at least one album I have access to.

**US-V4 — Access denied**
As a viewer, I cannot access an album I have not been granted access to, even if I know its URL.

---

## Feature: Nextcloud Integration

**US-NC1 — Link a photo to Nextcloud**
As an editor, I can attach a Nextcloud share link to a photo, so viewers can download the original high-quality file directly from Nextcloud.

**US-NC2 — Download original from photo page**
As a viewer, I can click a "Download original" button on a photo page to be redirected to the Nextcloud link, so I can get the full-resolution file without it being stored on this server.

**US-NC3 — Manage Nextcloud link**
As an editor, I can update or remove the Nextcloud link on any of my photos at any time.

---

## Feature: GPS & Map

**US-GPS1 — Add GPS coordinates to a photo**
As an editor, I can enter a latitude and longitude on a photo (at upload time or by editing it later), so the location where the photo was taken is recorded.

**US-GPS2 — View a photo's location**
As a viewer, I can see a small map on the photo detail page showing where the photo was taken, when GPS coordinates are available.

**US-GPS3 — Browse photos on a map**
As a viewer, I can open a full map view that shows pins for all photos I have access to that have GPS coordinates, and click a pin to open the photo.

**US-GPS4 — Filter map by album or tag**
As a viewer, I can filter the map to show only photos from a specific album or tag, so I can explore a particular set of locations.

---

## Feature: Timeline

**US-TL1 — View photos in a timeline**
As a viewer, I can browse all photos I have access to in chronological order, grouped by month and year, so I can explore them as a story over time.

**US-TL2 — Filter timeline by album or tag**
As a viewer, I can filter the timeline to a specific album or tag to see only the relevant photos in chronological order.

**US-TL3 — Photo date**
As an editor, I can set a "taken on" date on a photo (separate from the upload date), so the timeline reflects when the photo was actually taken rather than when it was uploaded.
