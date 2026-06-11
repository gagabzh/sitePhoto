# Photos

**[DONE] US-P1 — Upload a photo**
As an editor, I can upload a photo with a title and optional description, so I can add content to the site.

**[DONE] US-P2 — Tag a photo**
As an editor, I can add tags (places, people) to a photo at upload time or later, so it can be found by browsing.

**[DONE] US-P3 — Edit a photo**
As an editor, I can update the title, description, and tags of my own photos after upload. As an admin, I can edit any photo.

**[DONE] US-P4 — Delete a photo**
As an editor, I can delete my own photos. As an admin, I can delete any photo.

**[DONE] IMP-1 — Date taken from EXIF** ✓
As an editor, I no longer fill in a date taken at upload — it is extracted automatically from EXIF. I can still correct it later via the edit form.

**[DONE] IMP-2 — Batch upload** ✓
As an editor, when I open an album I can select multiple photos (or an entire folder) at once. Before confirming, I can optionally set tags and GPS coordinates that will be applied to every photo in the batch. EXIF metadata (date taken, focal length, exposure time) is extracted individually per photo.

**[DONE] IMP-3 — Back buttons at the top of pages** ✓
As a user, back and cancel buttons appear at the top of every form or detail page so I can navigate back without scrolling to the bottom.

**[DONE] IMP-4 — Select all** ✓
As an editor, on the photo list page and on an album detail page, I can click a "Select all" button to check every visible photo at once, so I can perform bulk actions on all of them.

**IMP-5 — Consolidate tags and people display on photo detail**
As a viewer looking at a photo detail page, I expect to see tags and people tags displayed in the same visual location, so the metadata is organized consistently and I can quickly understand who and what is in the photo.

- On the photo detail page (`GET /photos/:id`), the tags (from `photo_tags` via TG-2) and people tags (from `person_faces` via AI-2/AI-3) are currently displayed in separate sections of the page.
- Both tag types should be consolidated into a single "Tags" or "Metadata" section.
- People tags should be visually distinguished from regular tags (e.g., with a person icon prefix, different color, or "People:" heading).
- The consolidated display maintains the same functionality: clicking a tag filters photos by that tag.
- The layout should be responsive and work well on both desktop and mobile.

**Acceptance criteria:**
1. Tags and people tags appear in the same section on the photo detail page.
2. People tags are visually distinct from regular tags.
3. All existing tag functionality (click to filter) continues to work.
4. The change does not affect the photo edit form (where tags and people may have separate inputs).

**Edge cases:**
- Photo with only tags (no people): section still renders correctly.
- Photo with only people tags (no regular tags): section still renders correctly.
- Photo with neither: tags section is not displayed or shows "No tags".
- Mobile layout: tags wrap appropriately and remain readable.

> **Technical notes:**
> - This is a frontend templating change in `src/routes/photosViews.js` or the corresponding template.
> - No backend changes required — both tag types already exist in the photo detail query.
> - Consider accessibility: screen readers should announce the difference between tag types.

---

**LB-1 — Lightbox / fullscreen viewer in album**
As a viewer browsing an album, I can click any photo thumbnail to open it in a fullscreen overlay. I can navigate to the previous/next photo with arrow keys or on-screen buttons, and close with Escape or a close button — so I can view photos without leaving the album page.
