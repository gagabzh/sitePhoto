# V3 — Implementation Plan

## Phase 1 — Multi-album schema (MA)

Biggest breaking change: reverses IMP-5 and restores a many-to-many relationship between photos and albums.

### Migration (v4.sql)
- Add `album_photos (album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE, photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE, PRIMARY KEY (album_id, photo_id))`
- Migrate existing data: `INSERT INTO album_photos SELECT album_id, id FROM photos WHERE album_id IS NOT NULL`
- Drop `album_id` column from `photos`

### Routes to update
Every route that reads or writes `p.album_id` must be rewritten to use the join table:
- `GET /photos` — join `album_photos` for album filter
- `GET /albums/:id` — `JOIN album_photos ap ON ap.album_id = $1 JOIN photos p ON p.id = ap.photo_id`
- `POST /albums/:id/photos` — insert into `album_photos`, no longer sets `album_id`
- `DELETE /albums/:id/photos` — delete from `album_photos`
- `GET /timeline` — album filter via `album_photos` join
- `GET /map` — album filter via `album_photos` join
- All viewer-scoped queries — `album_access` join goes through `album_photos`
- Photo edit form (`GET/POST /photos/:id/edit`) — add multi-album membership UI (MA-3)
- Photo detail page (`GET /photos/:id`) — show album list (MA-2)

### Key decisions
- A photo with zero album memberships is a standalone photo (same semantics as before)
- Removing from an album never deletes the photo
- Viewer access: a viewer sees a photo if they have access to **at least one** album the photo belongs to

---

## Phase 2 — Album UX + Recipe album (ALB + RA)

These are independent of each other but both depend on Phase 1 completing first.

### ALB-1 — Click-to-edit / lightbox button in album
- On album detail, each photo thumbnail gets an overlay icon (e.g. ✏️ or expand icon)
- For editor/admin: thumbnail click → `/photos/:id/edit`; icon click → opens lightbox
- For viewer: thumbnail click → lightbox (no change from current)
- Role check is server-side (rendered HTML differs per role) and client-side for icon visibility

### RA-1 — Snapshot album from recipe
- Add a "Create album" button to the recipe detail view (or the combinator sidebar when a recipe is loaded)
- `POST /api/recipes/:id/album` — accepts `{ title }`, runs the recipe query, creates the album, bulk-inserts into `album_photos`, returns new album id
- Redirect to the new album's page
- Error if recipe produces zero results (show message, don't create empty album)

---

## Phase 3 — Design refresh (DS-11, DS-12, DS-13)

These three are fully independent and can be worked in parallel.

### DS-11 — Travel pages
- Redesign `/travels`, `/travels/:id`, `/travels/new`, `/travels/:id/edit`
- New interactions: click map pin → photo panel; click GPX trace segment → date/time tooltip; inline link/unlink of albums and photos without page reload (fetch + DOM update)

### DS-12 — Tag combinator
- Visual consistency pass: spacing, typography, chip design aligned with app design system
- New interactions: inline tag creation (type → "Create tag X" appears in dropdown); drag-to-reorder recipe sections; mobile layout improvements

### DS-13 — Photo selection
- Rubber-band drag-select on photo grids (mousedown → mousemove → mouseup)
- Shift+click for range select; Cmd/Ctrl+click for toggle
- Visible selection count badge; floating action bar appears when ≥ 1 photo selected

---

## Phase 4 — Local AI (AI)

Both features require Ollama running locally with a vision-capable model (e.g. `llava`, `moondream`, or `llava-phi3`). Node calls `http://localhost:11434/api/generate` with the image encoded as base64.

### AI-1 — Duplicate detection
- Admin panel: "Scan for duplicates" button → `POST /admin/ai/duplicates`
- Step 1: compute perceptual hash (pHash) for every photo using `sharp` — fast, no model needed
- Step 2: group photos whose pHash distance < threshold (near-duplicates)
- Step 3: for uncertain pairs (threshold border), call Ollama to confirm similarity
- Results page: groups of similar photos, each with thumbnails and a "Delete" / "Keep all" action
- Store scan results in a session or temp table; rescan clears previous results

### AI-2 — People identification
- On photo detail or album detail: "Identify people" button per photo (or batch via selection)
- `POST /api/ai/identify-people` — accepts `{ photoIds }`
- For each photo: encode image as base64, send to Ollama with a prompt listing existing people tags: "Who is in this photo? Known people: [Alice, Bob, …]. Answer with names from the list or describe if unknown."
- Response parsed to extract name mentions → matched against existing `people`-category tags
- UI: suggestion chips ("Alice? ✓ ✗", "Unknown person — create tag?") the user confirms or dismisses
- Confirmed tags are inserted into `photo_tags`

### Ollama integration notes
- Wrap Ollama calls in a helper `src/ollama.js` with a timeout and a clear error when Ollama is unreachable
- Vision model must be pulled before use: `ollama pull llava` (document in README)
- Processing is sequential to avoid overloading the local GPU/CPU; show progress to the user

---

## Dependencies

```
Phase 1 (MA schema)
  └── Phase 2 (ALB-1, RA-1)   ← needs album_photos table
  └── Phase 3 (DS-11/12/13)   ← independent, can start any time
  └── Phase 4 (AI-1, AI-2)    ← independent, can start any time
```

Recommended order: **1 → 2** (schema first, then UX), **3 + 4 in parallel** after phase 1.

---

## Risks

- **MA migration on live data**: the `album_id → album_photos` migration must be tested against a production DB dump before running. A photo in multiple albums is impossible pre-migration, so the migrate script is a straight copy (no ambiguity).
- **Viewer access query complexity**: joining `album_access → album_photos → photos` adds a join hop to every viewer-scoped query. Check query plans on large datasets.
- **Ollama availability**: AI features must degrade gracefully when Ollama is unreachable (show a clear error, never crash the app).
- **pHash false positives**: very similar but distinct photos (e.g. burst shots) will be flagged. The admin review step is essential — never auto-delete.
- **DS-13 rubber-band select**: browser drag behaviour conflicts with text selection and image dragging; will need `preventDefault` on mousedown and pointer capture.
