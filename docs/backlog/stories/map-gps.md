# Map & GPS

**[DONE] US-GPS1 — Add GPS coordinates to a photo**
As an editor, I can enter a latitude and longitude on a photo (at upload time or by editing it later), so the location where the photo was taken is recorded.

**[DONE] US-GPS2 — View a photo's location**
As a viewer, I can see a small map on the photo detail page showing where the photo was taken, when GPS coordinates are available.

**[DONE] US-GPS3 — Browse photos on a map**
As a viewer, I can open a full map view that shows pins for all photos I have access to that have GPS coordinates, and click a pin to open the photo.

**[DONE] US-GPS4 — Filter map by album or tag**
As a viewer, I can filter the map to show only photos from a specific album or tag, so I can explore a particular set of locations.

**US-GPS5 — Auto-add place tags from GPS coordinates**
As an editor uploading a photo with GPS coordinates, I want the system to automatically add place tags (town, country) based on the location, so I don't have to manually tag every photo with its location.

- When a photo with GPS coordinates is uploaded or edited, the system performs a reverse geocoding lookup to determine the town/city and country.
- If the reverse geocoding returns valid results, the system automatically adds tags for the town and country (e.g., "Paris", "France").
- The automatically added tags follow the same format as manually added tags (stored in `photo_tags` table).
- The reverse geocoding uses a free service (e.g., Nominatim/OpenStreetMap) or a local database.
- The feature is opt-in or can be disabled via a configuration setting.
- If reverse geocoding fails or returns no results, no tags are added (silent failure).
- The editor can still manually add, edit, or remove place tags after upload.

**Acceptance criteria:**
1. Photo upload with GPS coordinates triggers reverse geocoding.
2. Town and country tags are automatically added to the photo.
3. Tags are stored in the database and visible on the photo detail page.
4. The photo can be filtered by these auto-added place tags.
5. A configuration option exists to enable/disable auto-tagging.

**Edge cases:**
- GPS coordinates in the middle of nowhere (no town nearby): no tags added.
- GPS coordinates in international waters: no tags added or country-only.
- Reverse geocoding service unavailable: no tags added, upload continues.
- Rate limiting on the reverse geocoding service: implement retry or fallback.
- Multiple possible matches for coordinates: use the most specific result.
- Photo has existing place tags: auto-added tags are merged with existing ones (no duplicates).

**Error states:**
- Reverse geocoding timeout: upload succeeds without place tags.
- Reverse geocoding returns error: upload succeeds without place tags.
- Network error: upload succeeds without place tags.

> **Technical notes:**
> - Use Nominatim API (OpenStreetMap) for reverse geocoding: `https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=10`
> - Consider caching results to avoid repeated lookups for the same coordinates.
> - Add a new configuration variable `AUTO_TAG_PLACES` (default: true) to enable/disable.
> - Store the raw reverse geocoding response in a new `geocode_cache` table for debugging.
> - Consider adding a `place_source` column to track whether a tag was auto-added or manual.

---

**MAP-1 — Search by location and radius**
As a user, on the map page I can type a location name (e.g. "Paris"), pick it from suggestions, and set a radius in kilometres. Only photos within that distance from the chosen point are shown.
