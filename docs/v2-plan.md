# V2 — Implementation Plan

## Phase 1 — Schema changes (migration v2.sql)

These are breaking changes that everything else depends on.

### IMP-5: one album per photo
- Add `album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL` to `photos`
- Migrate existing `album_photos` rows → set `photo.album_id` (first album wins if a photo is in several)
- Drop `album_photos` table
- Update all routes that join on `album_photos` (albums, timeline, map, tags)

### Travel tables
- `travels (id, user_id, title, description, gpx_filename, created_at, updated_at)`
- `travel_albums (travel_id, album_id)` — many-to-many
- `travel_photos (travel_id, photo_id)` — standalone photos linked to a travel
- `travel_access (travel_id, viewer_id)` — sharing

---

## Phase 2 — UX improvements (no schema change)

Safe to do independently of phase 1.

- **IMP-1**: remove date taken input from upload form; keep it on the edit form
- **IMP-3**: move back/cancel buttons to the top of every form and detail page
- **IMP-4**: add "Select all" checkbox button to photo list and album detail pages

---

## Phase 3 — Batch upload (IMP-2)

Depends on phase 1 (album_id on photos).

- Album detail page: add a multi-file / folder picker (`<input multiple webkitdirectory>`)
- Pre-upload form: optional shared tags field + shared GPS coordinates field (accepts decimal or DMS)
- Server: loop over each file — extract EXIF individually, apply shared tags and GPS if provided, insert one row per photo with `album_id` set
- Reuse existing `parseCoord`, `extractMetadata`, `optimizePhoto` helpers

---

## Phase 4 — Travel feature (TR-1 to TR-5)

Depends on phase 1 (travel tables).

- CRUD routes under `/travels`
- GPX upload: store file in `uploads/gpx/`, parse with a lightweight JS GPX parser to extract the polyline for Leaflet
- Travel detail page: Leaflet map with GPX trace layer + photo pins; list of linked albums and photos with their descriptions
- Share: `travel_access` table; access check propagates to linked albums and photos for viewer queries

---

## Phase 5 — Tag Combinator ✅ DONE (PR #24, merged 2026-05-12)

Full tag filter builder replacing the single-tag page.

- `migrations/v3.sql`: `category` column on `tags` (`people/places/years/themes`), `tag_recipes` table
- `src/combinator.js`: shared `parseState` / `buildWhere` / `buildConditions` — ANY/ALL/NONE/not tri-state logic; years section uses `EXTRACT(YEAR FROM taken_at)` instead of tag subqueries
- `src/routes/api.js`: `GET /api/tags/index`, `GET /api/photos/combinator` (paginated), `GET /api/tags/counts`, CRUD `/api/recipes`
- `src/routes/tags.js`: server-renders initial results from URL params; ~200 lines embedded vanilla JS for live debounced updates (150 ms), `history.replaceState`, tri-state toggles, recipe save/load/delete
- CSS: two-column layout, chip/checkbox transitions, pill scale-in animation, dialog fade+scale, mobile collapsible sidebar sections (≤900px)
- Mobile bottom nav: "more" button (···) groups timeline + tags above the bar
- 33 unit tests, 257 total passing

---

## Phase 6 — Map zone search (MAP-1)

- Geocoding: Nominatim API (OpenStreetMap, no API key) — type-ahead suggestions in the filter bar
- Distance filter: Haversine formula in SQL (`2 * R * asin(...)`) or `earth_distance` extension
- UI: location text input + radius slider or number input (km); updates the map on submit

---

## Phase 7 — Timeline date range (TL-4)

- Add `from` and `to` query params to `/timeline`
- Filter bar: two date inputs with optional browser date picker
- SQL: `AND taken_at >= $from AND taken_at <= $to` appended when present

---

## Dependencies summary

```
Phase 1 (schema)
  └── Phase 2 (UX)        ← independent, can start anytime
  └── Phase 3 (batch)     ← needs album_id on photos
  └── Phase 4 (travel)    ← needs travel tables
  └── Phase 5 (tags)      ← independent
  └── Phase 6 (map)       ← independent
  └── Phase 7 (timeline)  ← independent
```

Recommended order: 1 → 2+5+6+7 (parallel) → 3 → 4

---

## Open questions / risks

- **GPX parser**: no native Node.js GPX support — evaluate `gpxparser` (npm) or parse XML manually
- **Nominatim rate limit**: 1 request/second max; debounce the autocomplete input
- **IMP-5 migration**: if the live DB has photos in multiple albums, the "first album wins" rule may lose data — confirm with user before running
- **Travel access propagation**: when a viewer has travel access, all linked albums and photos must be visible; this adds a join path to every viewer-scoped query
