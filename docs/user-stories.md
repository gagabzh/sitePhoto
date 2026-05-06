# User Stories

---

## Design System

**DS-1 — Avatar dropdown navigation**
As a logged-in user, I see my initial in a circle in the top-right corner of every page. Clicking it opens a small menu with Account (always) and Admin (admins only), and a Logout option below a separator, so the navigation bar stays uncluttered.

**DS-2 — Family Wall photo list**
As an editor or admin browsing `/photos`, I see a hero strip of the 4 most recent photos, then a mosaic wall (groups of 9 with a large featured first cell), and a sidebar showing who has uploaded photos, the top tags, and the latest album — so the page feels like a living family wall rather than a flat list.

**DS-3 — Photo Books album list**
As a user browsing `/albums`, each album appears as a photo book with an ink spine, a 4:5 cover (filled by the first photo or a "no photos yet" note), a rotated label card with the title and creator, and a ribbon badge showing the photo count (or "EMPTY") — so the list feels like a shelf of real books.

**DS-4 — Inside an Album**
As a user opening an album, I see a 320 px cover photo on the left and the album info (title, description, photo and contributor counts, action buttons) on the right, followed by a 6-column mosaic of the first 9 photos — so the page reads like opening a photo book.

**DS-5 — Access Vault**
As an editor managing album access (`/albums/:id/access`), I see a header with "who can see [Album]?", a summary bar showing the album is private, a main panel listing current viewers with a revoke button each, and a sidebar panel where each candidate has their own inline Grant access button — so granting and revoking is direct and per-person.

**DS-6 — Map First**
As a user on `/map`, the map fills the full viewport height and a 280 px sidebar on the left shows a filter form and a list of albums with photo counts. Clicking a map pin or cluster opens a photo strip overlay at the bottom of the map with thumbnails and coordinates — so the map is the primary experience.

**DS-7 — Timeline Story**
As a user on `/timeline`, I see a large handwritten headline ("everything we've seen together, in order"), a stats block (total photos, people, first year), and below it each month as a row with a dot timeline, the month-year heading, a photo count and uploader list, and a variable-size photo grid (1–5 cells) — so the timeline reads like a shared diary.

**DS-8 — The Ledger**
As an admin on `/admin/users`, I see "the ledger." as the page heading and a structured table with an avatar circle, name, email, role chip (solid for ADMIN, blue for EDITOR, outlined for VIEWER), and join date per row. The edit/password/delete actions are invisible at rest and reveal on row hover — so the page is calm to read but fast to act on.

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

---

## Version 2

---

## Improvements

**IMP-1 — Date taken removed from upload**
As an editor, I no longer fill in a date taken at upload — it is extracted automatically from EXIF. I can still correct it later via the edit form.

**IMP-2 — Batch upload to an album**
As an editor, when I open an album I can select multiple photos (or an entire folder) at once. Before confirming, I can optionally set tags and GPS coordinates that will be applied to every photo in the batch. EXIF metadata (date taken, focal length, exposure time) is extracted individually per photo.

**IMP-3 — Back buttons at the top of pages**
As a user, back and cancel buttons appear at the top of every form or detail page so I can navigate back without scrolling to the bottom.

**IMP-4 — Select all**
As an editor, on the photo list page and on an album detail page, I can click a "Select all" button to check every visible photo at once, so I can perform bulk actions on all of them.

**IMP-5 — One album per photo**
As an editor, each photo belongs to at most one album. If I add a photo that is already in another album, it is moved to the new one. Photos not added to any album remain as standalone photos, visible in the photo list.

---

## Feature: Travel (TR)

**TR-1 — Create a travel**
As an editor, I can create a travel with a title and a description, and optionally upload a GPX file to display the route on a map.

**TR-2 — Link content to a travel**
As an editor, I can link albums and/or standalone photos to a travel. Each linked item's title and description is visible on the travel page.

**TR-3 — View a travel**
As an authorised user, I can open a travel page and see: the GPS trace on a map (if a GPX file was uploaded), photo pins on the same map, the description, and all linked albums and photos with their descriptions.

**TR-4 — Share a travel**
As an editor, I can share a travel with specific viewer accounts (same mechanism as album sharing). Sharing a travel grants the viewer access to all linked albums and photos.

**TR-5 — Edit / delete a travel**
As an editor, I can edit the title, description, GPX file, and linked content of my own travels. As an admin, I can edit or delete any travel.

---

## Feature: Tag management (TG)

**TG-1 — Multi-tag filter**
As a user, on the tags page I can select several tags and see only photos that have all of the selected tags (AND logic, not OR).

---

## Feature: Map improvements (MAP)

**MAP-1 — Search by location and radius**
As a user, on the map page I can type a location name (e.g. "Paris"), pick it from suggestions, and set a radius in kilometres. Only photos within that distance from the chosen point are shown.

---

## Feature: Timeline improvements (TL)

**TL-4 — Filter by date range**
As a user, on the timeline page I can set a "from" date and/or a "to" date (each with an optional date picker) to show only photos taken within that period.
