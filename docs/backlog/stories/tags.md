# Tags

**TG-1 — Multi-tag filter**
As a user, on the tags page I can select several tags and see only photos that have all of the selected tags (AND logic, not OR).

**TG-2 — Tag autocomplete**
As an editor, when I type in a tag field (at upload time or on the edit form), I see a dropdown of existing tags matching what I've typed — so I reuse consistent tags rather than creating near-duplicates.

---

**TG-3 — Clickable tags on photo detail**
As a viewer on the photo detail page, I can click on any tag (or people tag) to navigate to the tag page with that tag pre-selected in the filter, so I can quickly see all photos with the same tag.

- On the photo detail page (`GET /photos/:id`), each tag displayed is a clickable link.
- Clicking a tag navigates to the tag combinator page (`GET /tags`) with that tag pre-selected.
- The URL includes the tag filter parameter (e.g., `/tags?tags[]=paris` or `/tags?tag=paris` depending on the existing filter format).
- People tags are also clickable and filter by the person's name.
- The click behavior works the same for both regular tags and people tags.
- The link opens in the same browser tab (not a new window).
- Hovering over a tag shows a visual indicator (cursor changes to pointer, underline, or color change).

**Acceptance criteria:**
1. Regular tags on photo detail page are clickable links.
2. People tags on photo detail page are clickable links.
3. Clicking a tag navigates to `/tags` with that tag pre-selected.
4. The tag combinator page correctly displays photos filtered by the clicked tag.
5. The click behavior is consistent across desktop and mobile.

**Edge cases:**
- Tag with spaces or special characters: URL-encoded properly.
- Tag that doesn't exist in the system anymore: link still works (the tag page shows no results).
- Multiple tags with the same name (different capitalization): clicking either filters by that exact tag name.
- User has no access to the tag page: standard authentication/authorization applies.

> **Technical notes:**
> - Update the tag rendering in `src/routes/photosViews.js` to use `<a>` tags instead of `<span>`.
> - The href should be `/tags?tags[]=${encodeURIComponent(tagName)}` to match the existing tag combinator query format.
> - Ensure people tags use the same link format but with their name as the tag.
> - Maintain existing styling for tags, just make them clickable.
> - Consider adding `aria-label` for accessibility (e.g., "Filter photos by tag: paris").
