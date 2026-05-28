# V2 — Implementation Plan

## Phase 1 — Schema changes (migration v2.sql) ✅ DONE

These are breaking changes that everything else depends on.

### IMP-5: one album per photo ✅
- `album_id` on `photos`, `album_photos` dropped, all routes updated

### Travel tables ✅
- `travels`, `travel_albums`, `travel_photos`, `travel_access` — all created in v2.sql

---

## Phase 2 — UX improvements ✅ DONE

- **IMP-1** ✅: date taken removed from upload form
- **IMP-3** ✅: back/cancel buttons moved to top
- **IMP-4** ✅: "Select all" checkbox on photo list and album detail pages

---

## Phase 3 — Batch upload (IMP-2) ✅ DONE

- Multi-file / folder picker on album detail page
- Shared tags + GPS fields on pre-upload form
- Server loops over each file, applies shared tags/GPS, inserts with `album_id`

---

## Phase 4 — Travel feature (TR-1 to TR-5) ✅ DONE

- CRUD routes under `/travels`
- GPX upload + Leaflet trace layer on travel detail page
- `travel_access` sharing with viewer propagation

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

## Phase 6 — Map zone search (MAP-1) ✅ DONE (PR #22 + #25, merged 2026-05-18)

- Geocoding: Nominatim API — type-ahead location input in filter bar
- Distance filter: Haversine formula in SQL
- UI: location text input + radius number input (km); applies on submit
- Map sidebar PLACES list: place-category tags replacing album filter pins

---

## Phase 7 — Timeline improvements (TL-4/5/6) ✅ DONE (PR #29, merged 2026-05-19)

- **TL-4**: `from` / `to` date inputs in filter bar; `parseDate` validates; SQL `taken_at::date >= / <=`
- **TL-5**: "+X more" drills into that group's exact period; single-group result shows all photos (no cap)
- **TL-6**: Group by Year / Month / Day selector on its own row; Filter and Apply are independent forms; Clear preserves active grouping
- 51 unit tests passing

---

## Status: all V2 phases complete ✅
