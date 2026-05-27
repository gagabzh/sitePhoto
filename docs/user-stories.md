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

**DS-9 — Responsive mobile layout**
As a user on a smartphone, every page (photos wall, album list, album detail, timeline, map, forms) adapts to a narrow screen: navigation collapses gracefully, grids stack to 1–2 columns, and no content overflows horizontally — so the site is fully usable on mobile.

**DS-10 — Tag page design**
As a user on `/tags`, the page reflects the paper/ink design system: tags are displayed as pills with ink borders, the cloud adapts size to frequency, and the layout matches the visual identity of the rest of the site.

**DS-11 — Travel pages redesign + interactions**
As a user viewing a travel, the map, GPX trace, photo pins, and linked albums are presented in a polished layout consistent with the rest of the app. I can interact with the map (click a pin to jump to the photo, click the trace to see the date/time), and link or unlink albums/photos inline without leaving the page.

**DS-12 — Tag combinator redesign + interactions**
As a user on the tag combinator, the two-column filter builder is visually consistent with the app's design system. I can create new tags inline (without leaving the page), drag sections to reorder them, and the mobile layout is fully usable on small screens.

**DS-13 — Photo selection redesign + interactions**
As an editor selecting photos (on the photo list or album detail), I can rubber-band select a range by clicking and dragging, use keyboard shortcuts (Shift+click for range, Cmd/Ctrl+click for individual), and the selected state is clearly visible — so bulk operations are fast and comfortable.

---

## User Management

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

## Account Page

**ACC-1 — Role-aware identity card**
As a logged-in user, my account page shows an identity card adapted to my role (admin, editor, or viewer): a large avatar, a greeting, stats (uploads, albums, favourites, comments, recipes), a permission strip listing what I can and cannot do, and cards relevant to my role — so I can see everything about my account at a glance.

**ACC-2 — Inline profile editing**
As a logged-in user, I can edit my display name, email, language, theme, and notification preferences directly on my account page by clicking the value inline — no separate form page.

**ACC-3 — Avatar**
As a logged-in user, I can upload a profile photo via a "↻ change" button on my avatar. If I have no avatar, my initial letter is displayed in a styled circle — so the avatar always looks intentional.

**ACC-4 — Session management**
As a logged-in user, I can see the list of my active sessions (browser, device, last seen) and revoke any of them individually or all others at once — so I can sign out of forgotten devices.

**ACC-5 — Danger zone**
As a logged-in user, I can delete my own account from the danger zone with a two-step confirmation (typed username required) — so the action cannot be done by accident.

---

## Photos

**US-P1 — Upload a photo**
As an editor, I can upload a photo with a title and optional description, so I can add content to the site.

**US-P2 — Tag a photo**
As an editor, I can add tags (places, people) to a photo at upload time or later, so it can be found by browsing.

**US-P3 — Edit a photo**
As an editor, I can update the title, description, and tags of my own photos after upload. As an admin, I can edit any photo.

**US-P4 — Delete a photo**
As an editor, I can delete my own photos. As an admin, I can delete any photo.

**IMP-1 — Date taken from EXIF** ✓
As an editor, I no longer fill in a date taken at upload — it is extracted automatically from EXIF. I can still correct it later via the edit form.

**IMP-2 — Batch upload** ✓
As an editor, when I open an album I can select multiple photos (or an entire folder) at once. Before confirming, I can optionally set tags and GPS coordinates that will be applied to every photo in the batch. EXIF metadata (date taken, focal length, exposure time) is extracted individually per photo.

**IMP-3 — Back buttons at the top of pages** ✓
As a user, back and cancel buttons appear at the top of every form or detail page so I can navigate back without scrolling to the bottom.

**IMP-4 — Select all** ✓
As an editor, on the photo list page and on an album detail page, I can click a "Select all" button to check every visible photo at once, so I can perform bulk actions on all of them.

**LB-1 — Lightbox / fullscreen viewer in album**
As a viewer browsing an album, I can click any photo thumbnail to open it in a fullscreen overlay. I can navigate to the previous/next photo with arrow keys or on-screen buttons, and close with Escape or a close button — so I can view photos without leaving the album page.

---

## Albums

**US-A1 — Create an album**
As an editor, I can create an album with a title and optional description. The cover photo is automatically set to the first photo added to the album.

**US-A2 — Add / remove photos from an album**
As an editor, I can add or remove photos from my own albums. As an admin, I can do this on any album.

**US-A3 — Edit / delete an album**
As an editor, I can edit the title and description of my own albums, or delete them. As an admin, I can edit or delete any album.

**IMP-5 — One album per photo** ✓
As an editor, each photo belongs to at most one album. If I add a photo that is already in another album, it is moved to the new one. Photos not added to any album remain as standalone photos, visible in the photo list.

**MA-1 — A photo can belong to multiple albums**
As an editor, I can add any photo to more than one album. Removing a photo from an album does not delete the photo — it only removes the membership. A photo with no album memberships remains visible as a standalone photo.

**MA-2 — Photo detail shows album memberships**
As a user viewing a photo's detail page, I can see the list of albums the photo belongs to, each as a clickable link — so I can navigate to any of those albums directly.

**MA-3 — Manage album memberships from the edit form**
As an editor, on the photo edit page I can add the photo to additional albums or remove it from existing ones — so I can curate membership without going album by album.

**ALB-1 — Click-to-edit in album, explicit lightbox button**
As an editor or admin browsing an album, clicking a photo thumbnail opens the photo edit page. A visible lightbox icon on the thumbnail opens the fullscreen viewer instead — so editing is one click away and the lightbox is still accessible.
As a viewer, clicking a photo thumbnail opens the lightbox (unchanged), since viewers have no edit access.

**ALB-2 — Context-aware back button on photo detail and edit pages**
As a user, when I navigate to a photo's detail or edit page from an album, the "back" button returns me to that album — not a generic fallback. When I arrive from the photos list, the back button returns me to the photos list.

**RA-1 — Create a snapshot album from a tag recipe**
As an editor, on the tag combinator page I can select a saved recipe and click "Create album from recipe". I give the album a name, and the app creates a new album containing all photos that currently match the recipe — so I can save a curated set without manually selecting each photo.

> **Implementation note:** The 📁 button appears on every recipe row in the sidebar. Recipes with no filters are rejected by the API (422). These are intentional deviations from the original spec.

---

## Access Control

**US-AC1 — Grant viewer access to an album**
As an editor, I can give specific viewers access to one of my albums, so only authorised people can see it.

**US-AC2 — Revoke viewer access**
As an editor, I can remove a viewer's access to one of my albums.

---

## Browsing

**US-V1 — Browse albums**
As a viewer, I can see the list of albums I have been granted access to, each showing its cover photo, title, and description.

**US-V2 — View album content**
As a viewer, I can open an album I have access to and browse all its photos.

**US-V3 — Browse by tag**
As a viewer, I can browse photos by tag, and only see photos that belong to at least one album I have access to.

**US-V4 — Access denied**
As a viewer, I cannot access an album I have not been granted access to, even if I know its URL.

---

## Tags

**TG-1 — Multi-tag filter**
As a user, on the tags page I can select several tags and see only photos that have all of the selected tags (AND logic, not OR).

**TG-2 — Tag autocomplete**
As an editor, when I type in a tag field (at upload time or on the edit form), I see a dropdown of existing tags matching what I've typed — so I reuse consistent tags rather than creating near-duplicates.

---

## Map & GPS

**US-GPS1 — Add GPS coordinates to a photo**
As an editor, I can enter a latitude and longitude on a photo (at upload time or by editing it later), so the location where the photo was taken is recorded.

**US-GPS2 — View a photo's location**
As a viewer, I can see a small map on the photo detail page showing where the photo was taken, when GPS coordinates are available.

**US-GPS3 — Browse photos on a map**
As a viewer, I can open a full map view that shows pins for all photos I have access to that have GPS coordinates, and click a pin to open the photo.

**US-GPS4 — Filter map by album or tag**
As a viewer, I can filter the map to show only photos from a specific album or tag, so I can explore a particular set of locations.

**MAP-1 — Search by location and radius**
As a user, on the map page I can type a location name (e.g. "Paris"), pick it from suggestions, and set a radius in kilometres. Only photos within that distance from the chosen point are shown.

---

## Timeline

**US-TL1 — View photos in a timeline**
As a viewer, I can browse all photos I have access to in chronological order, grouped by month and year, so I can explore them as a story over time.

**US-TL2 — Filter timeline by album or tag**
As a viewer, I can filter the timeline to a specific album or tag to see only the relevant photos in chronological order.

**US-TL3 — Photo date**
As an editor, I can set a "taken on" date on a photo (separate from the upload date), so the timeline reflects when the photo was actually taken rather than when it was uploaded.

**TL-4 — Filter by date range** ✓
As a user, on the timeline page I can set a "from" date and/or a "to" date (each with an optional date picker) to show only photos taken within that period.

**TL-5 — Drill into a group from "+X more"**
As a user, when a timeline group shows "+X more" (because there are more photos than the grid displays), I can click that link to see all photos in that specific period — so I don't miss photos that were hidden by the grid limit.

**TL-6 — Choose grouping interval**
As a user, I can switch the timeline grouping between Year, Month (default), and Day using a selector in the filter bar — so I can get the level of detail that fits what I'm looking for.

---

## Travel

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

## Nextcloud

**US-NC1 — Link a photo to Nextcloud**
As an editor, I can attach a Nextcloud share link to a photo, so viewers can download the original high-quality file directly from Nextcloud.

**US-NC2 — Download original from photo page**
As a viewer, I can click a "Download original" button on a photo page to be redirected to the Nextcloud link, so I can get the full-resolution file without it being stored on this server.

**US-NC3 — Manage Nextcloud link**
As an editor, I can update or remove the Nextcloud link on any of my photos at any time.

**US-NC4 — Import a Nextcloud shared folder**
As an editor, I can paste a Nextcloud public folder share link into an import form. The app lists all photos found in that folder (via WebDAV), uploads them all to sitephoto asynchronously, and stores the share URL on each imported photo. I can optionally apply common tags and a place to every photo in the import, and choose to group them into a new album — so a whole Nextcloud folder can be imported in one action without downloading anything manually.

**US-NC5 — Import progress feedback**
As an editor, after launching a Nextcloud folder import, I see a live status on the photos page ("import in progress — X of Y done") that updates in real time until all photos are uploaded and identified.

---

## Local AI

**AI-1 — Duplicate photo detection**
As an admin, I can trigger a duplicate scan from the admin panel. The app uses a local Ollama vision model to find visually similar or identical photos across the library and presents them grouped for review. I can then delete duplicates or dismiss false positives — so the library stays clean without manual comparison.

**AI-2 — People identification and tagging**
As an editor, I can ask the app to identify people in a photo (or a batch) using a local Ollama vision model. The app suggests existing people tags (from the `people` tag category) or proposes a new tag based on the description. I confirm or reject each suggestion — so people tags are applied consistently without fully manual work.

**AI-3 — Manual person tagging**
As an editor, on the photo detail page I can draw a rectangle around a face and enter the person's name — so I can correct or add a person tag when the AI suggestion is wrong or missing.

**AI-4 — AI learns from manual tags**
As an editor, when I manually tag a person on a photo, the system stores a crop of that face as a reference example. On future identifications, the AI receives those stored examples in its prompt and uses them to recognise the same person in new photos — so identification quality improves over time without any retraining.

---

## Infrastructure & Quality

**IQ-1 — Application security hardening**
As a developer, I audit and fix all injection vectors (SQL injection, XSS, path traversal, CSRF) and ensure no known CVEs exist in production dependencies, so the application is safe to expose on a public server.

**IQ-2 — Dependency CVE monitoring**
As a developer, I run an automated CVE check on every dependency (e.g. `npm audit`) in CI so that vulnerabilities are caught before they reach production.

**IQ-3 — Linter**
As a developer, I add ESLint (or equivalent) to the project with a consistent rule set, so code style is enforced automatically and obvious errors are caught before review.

**IQ-4 — Code quality metrics**
As a developer, I track test coverage (% of lines/branches exercised), code duplication (duplicated blocks), and function length (lines per function) so I can measure and improve maintainability over time.

**IQ-5 — VPS hardening** ✓
As a sysadmin, I apply VPS-level security measures (SSH key-only auth, firewall rules, automatic security updates, fail2ban or equivalent) so the server is not trivially compromised.

**S3-1 — Photos stored in Object Storage**
As an editor uploading a photo, the file is stored in OVH Object Storage (S3-compatible bucket) rather than on the server's local disk — so storage capacity is decoupled from the server, and photos are not lost if the server is replaced.

**S3-2 — Transparent experience for viewers**
As a viewer, browsing, downloading, and viewing photos works exactly as before — the migration to S3 storage is invisible to me.

**S3-3 — Photo deletion removes S3 object**
As an editor or admin deleting a photo, the file is removed from the S3 bucket at the same time as the database record — so no orphaned objects accumulate in storage.

**Q-1 — Upload returns immediately**
As an editor uploading a photo, the upload response is instant. People identification runs in the background on a dedicated worker — so I am never blocked waiting for the AI to finish.

**Q-2 — Real-time identification notification**
As an editor, after uploading a photo I see an "Identification in progress…" badge on it. When the worker finishes, the suggested people tags appear on the photo in real time without reloading the page.

**Q-3 — Identification resilience**
As an editor, if the worker is offline when I upload, the identification job is held in the queue and runs automatically when the worker comes back online — no photo is silently skipped.

**IV4-1 — Two-instance private architecture**
As a developer, the site runs on two OVH Public Cloud instances connected over a private vRack network: Instance-1 runs the Express app and PostgreSQL; Instance-2 runs the Node.js worker and Ollama. Redis is exposed only on the private network. Inter-instance HTTP calls are authenticated with a shared secret.

**IV4-2 — Local development with MinIO and Redis**
As a developer, running `docker compose up` locally starts a MinIO container (S3-compatible) and a Redis container alongside the app and worker — so the full async flow can be tested without any cloud account.

**IV4-3 — Worker instance on-demand lifecycle**
As a developer, Instance-2 starts automatically when a job enters the queue and shuts down (shelved, not billed) after a configurable period of inactivity — so compute cost is proportional to actual usage.

**INF-1 — Instance-1 right-sizing**
As an admin, Instance-1 is resized from b3-8 to b2-7 (2 vCPU, 7 GB RAM), cutting the monthly compute bill — with no user-visible change and a tested DB migration procedure to preserve all data across the Terraform-driven recreation.
