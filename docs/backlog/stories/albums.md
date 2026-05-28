# Albums

**[DONE] US-A1 — Create an album**
As an editor, I can create an album with a title and optional description. The cover photo is automatically set to the first photo added to the album.

**[DONE] US-A2 — Add / remove photos from an album**
As an editor, I can add or remove photos from my own albums. As an admin, I can do this on any album.

**[DONE] US-A3 — Edit / delete an album**
As an editor, I can edit the title and description of my own albums, or delete them. As an admin, I can edit or delete any album.

**[DONE] IMP-5 — One album per photo** ✓
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
