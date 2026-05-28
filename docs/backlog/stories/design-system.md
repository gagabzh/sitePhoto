# Design System

**[DONE] DS-1 — Avatar dropdown navigation**
As a logged-in user, I see my initial in a circle in the top-right corner of every page. Clicking it opens a small menu with Account (always) and Admin (admins only), and a Logout option below a separator, so the navigation bar stays uncluttered.

**[DONE] DS-2 — Family Wall photo list**
As an editor or admin browsing `/photos`, I see a hero strip of the 4 most recent photos, then a mosaic wall (groups of 9 with a large featured first cell), and a sidebar showing who has uploaded photos, the top tags, and the latest album — so the page feels like a living family wall rather than a flat list.

**[DONE] DS-3 — Photo Books album list**
As a user browsing `/albums`, each album appears as a photo book with an ink spine, a 4:5 cover (filled by the first photo or a "no photos yet" note), a rotated label card with the title and creator, and a ribbon badge showing the photo count (or "EMPTY") — so the list feels like a shelf of real books.

**[DONE] DS-4 — Inside an Album**
As a user opening an album, I see a 320 px cover photo on the left and the album info (title, description, photo and contributor counts, action buttons) on the right, followed by a 6-column mosaic of the first 9 photos — so the page reads like opening a photo book.

**[DONE] DS-5 — Access Vault**
As an editor managing album access (`/albums/:id/access`), I see a header with "who can see [Album]?", a summary bar showing the album is private, a main panel listing current viewers with a revoke button each, and a sidebar panel where each candidate has their own inline Grant access button — so granting and revoking is direct and per-person.

**[DONE] DS-6 — Map First**
As a user on `/map`, the map fills the full viewport height and a 280 px sidebar on the left shows a filter form and a list of albums with photo counts. Clicking a map pin or cluster opens a photo strip overlay at the bottom of the map with thumbnails and coordinates — so the map is the primary experience.

**[DONE] DS-7 — Timeline Story**
As a user on `/timeline`, I see a large handwritten headline ("everything we've seen together, in order"), a stats block (total photos, people, first year), and below it each month as a row with a dot timeline, the month-year heading, a photo count and uploader list, and a variable-size photo grid (1–5 cells) — so the timeline reads like a shared diary.

**[DONE] DS-8 — The Ledger**
As an admin on `/admin/users`, I see "the ledger." as the page heading and a structured table with an avatar circle, name, email, role chip (solid for ADMIN, blue for EDITOR, outlined for VIEWER), and join date per row. The edit/password/delete actions are invisible at rest and reveal on row hover — so the page is calm to read but fast to act on.

**[DONE] DS-9 — Responsive mobile layout**
As a user on a smartphone, every page (photos wall, album list, album detail, timeline, map, forms) adapts to a narrow screen: navigation collapses gracefully, grids stack to 1–2 columns, and no content overflows horizontally — so the site is fully usable on mobile.

**[DONE] DS-10 — Tag page design**
As a user on `/tags`, the page reflects the paper/ink design system: tags are displayed as pills with ink borders, the cloud adapts size to frequency, and the layout matches the visual identity of the rest of the site.

**[DONE] DS-11 — Travel pages redesign + interactions**
As a user viewing a travel, the map, GPX trace, photo pins, and linked albums are presented in a polished layout consistent with the rest of the app. I can interact with the map (click a pin to jump to the photo, click the trace to see the date/time), and link or unlink albums/photos inline without leaving the page.

**[DONE] DS-12 — Tag combinator redesign + interactions**
As a user on the tag combinator, the two-column filter builder is visually consistent with the app's design system. I can create new tags inline (without leaving the page), drag sections to reorder them, and the mobile layout is fully usable on small screens.

**[DONE] DS-13 — Photo selection redesign + interactions**
As an editor selecting photos (on the photo list or album detail), I can rubber-band select a range by clicking and dragging, use keyboard shortcuts (Shift+click for range, Cmd/Ctrl+click for individual), and the selected state is clearly visible — so bulk operations are fast and comfortable.
