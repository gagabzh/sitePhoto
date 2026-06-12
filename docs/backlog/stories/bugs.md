# Bugs

**BUG-1 — Tag autocompletion missing on Nextcloud import form**
As an editor, when I enter tags in the Nextcloud import form, I expect to see a dropdown of existing tags matching what I've typed (reusing TG-2 autocomplete functionality), so I can reuse consistent tags rather than creating near-duplicates.

*Current behavior:* The tag input field on the Nextcloud import form (`#nc-tags` in `src/routes/nextcloudImport.js`) is a plain text input with no autocomplete functionality.

*Expected behavior:* The tag input should integrate with the existing `/tags/autocomplete` endpoint (TG-2) to provide the same autocomplete experience as other tag inputs in the application.

*Technical note:* The autocomplete should trigger on input, query `/tags/autocomplete?q=<query>`, and display matching tags in a dropdown. The selected tag(s) should be comma-separated as per the current implementation. This requires adding JavaScript to `importFormScript()` in `src/routes/nextcloudImport.js` similar to the tag autocomplete implementation in `src/layout/page.js` (line 141) and `src/components.js`.

*Related:* TG-2 (Tag autocomplete endpoint already exists and works correctly)

*Status:* **FIXED in PR #112** (fix/bug-1-tag-autocomplete-nextcloud-import)

---

**BUG-2 — No debouncing on tag autocomplete input in Nextcloud import form**
As an editor using the Nextcloud import form, I expect the tag autocomplete to be responsive but not make excessive network requests, so that the interface feels fast and doesn't overload the server.

*Current behavior:* The autocomplete in `src/routes/nextcloudImport.js` (lines 128-133) triggers a fetch request on every keystroke with no debouncing.

*Expected behavior:* Input should be debounced (e.g., 300ms) to reduce unnecessary network requests while typing.

*Technical note:* Add a debounce mechanism to the input event listener. Can reuse the pattern from other debounced inputs in the codebase or implement a simple setTimeout/clearTimeout approach.

*Related:* BUG-1, TG-2


---

**BUG-2 — No debouncing on tag autocomplete input in Nextcloud import form**
As an editor using the Nextcloud import form, I expect the tag autocomplete to be responsive but not make excessive network requests, so that the interface feels fast and doesn't overload the server.

*Current behavior:* The autocomplete in `src/routes/nextcloudImport.js` (lines 128-133) triggers a fetch request on every keystroke with no debouncing.

*Expected behavior:* Input should be debounced (e.g., 300ms) to reduce unnecessary network requests while typing.

*Technical note:* Add a debounce mechanism to the input event listener. Can reuse the pattern from other debounced inputs in the codebase or implement a simple setTimeout/clearTimeout approach.

*Related:* BUG-1, TG-2

*Status:* **FIXED in main**

---

**BUG-3 — Extra leading space when inserting tag from autocomplete in Nextcloud import**
As an editor using tag autocomplete on the Nextcloud import form, I expect selected tags to be formatted cleanly without extra spaces, so my tag list looks professional.

*Current behavior:* In `src/routes/nextcloudImport.js` line 118, the `pick()` function adds a leading space: `parts[parts.length - 1] = ' ' + s;`, resulting in tags like " paris, vacation" instead of "paris, vacation".

*Expected behavior:* Tags should be inserted without extra leading spaces. Consider: `parts[parts.length - 1] = s;`

*Technical note:* Simple fix in the pick() function. Also consider trimming the last part before insertion to handle cases where user has typed spaces.

*Related:* BUG-1, TG-2

*Status:* **FIXED in main**

---

**BUG-4 — No loading state indicator for tag autocomplete in Nextcloud import**
As an editor using the tag autocomplete, I expect visual feedback while waiting for suggestions, so I know the feature is working and not broken.

*Current behavior:* No loading indicator is shown between typing and autocomplete results appearing in `src/routes/nextcloudImport.js`.

*Expected behavior:* Show a loading spinner or placeholder text while waiting for the `/tags/autocomplete` response.

*Technical note:* Add a loading state element to the `tag-ac-wrap` div and toggle its visibility during the fetch operation.

*Related:* BUG-1, TG-2

*Status:* **FIXED in main**

---

**BUG-5 — Duplicate tags can be added via autocomplete in Nextcloud import**
As an editor using tag autocomplete, I expect to avoid accidentally adding the same tag multiple times, so my tags remain clean and organized.

*Current behavior:* The autocomplete in `src/routes/nextcloudImport.js` (lines 116-121) does not check if a tag already exists in the input before adding it.

*Expected behavior:* If the user selects a tag that already exists in the input field, it should not be added again.

*Technical note:* In the `pick()` function, check if the selected tag already exists in the input value before appending it. Consider case-insensitive comparison.

*Related:* BUG-1, TG-2

*Status:* **FIXED in main**

---

**BUG-6 — Nextcloud import on Instance-1 doesn't work**
As an editor attempting to import photos from Nextcloud, I expect the import to complete successfully regardless of which instance handles the download, so I can add my photos to the library.

*Current behavior:* When attempting to import from Nextcloud, the process fails when Instance-1 tries to download files. The error occurs during the download step, preventing photos from being imported.

*Expected behavior:* Nextcloud import should work on Instance-1, downloading files from Nextcloud and storing them in S3 successfully.

*Technical note:* This may be related to US-NC6 (Faster Nextcloud import by downloading on Instance-1) which is currently in backlog. The current implementation (US-NC4/US-NC5) uses Instance-2 for downloads via BullMQ jobs. If someone manually tried to run the import flow on Instance-1, it may lack the necessary dependencies, WebDAV client configuration, or permissions.

*Investigation needed:* Check error logs on Instance-1 when import fails. Verify that the Nextcloud WebDAV client (`src/nextcloudWebdav.js`) is available and properly configured on Instance-1. Confirm that Instance-1 has network access to Nextcloud servers and can make outbound HTTPS requests.

*Related:* US-NC4, US-NC5, US-NC6, INF-4

---

**BUG-7 — Banner after Nextcloud import never disappears**
As an editor who has completed a Nextcloud import, I expect the progress banner to automatically dismiss after a short delay, so it doesn't permanently block my view of the photos page.

*Current behavior:* The banner showing "Import complete — X of Y photos imported" (or similar) remains visible indefinitely on the photos page after a Nextcloud import finishes.

*Expected behavior:* The banner should auto-dismiss 5 seconds after the import completes (matching US-NC5 criterion 1: "The banner persists for 5 seconds after completion, then dismisses itself").

*Technical note:* This is likely a frontend JavaScript issue in `src/public/photos.js` or a missing timeout in the banner dismissal logic. Check the socket.io event handler for `nextcloud-import-progress` (US-NC5) which should set a timeout when `done + failed >= total`. The server-side rendering may also need to verify the condition `done + failed < total` is false to prevent re-rendering the banner on page refresh.

*Investigation needed:* Check the banner dismissal logic in the frontend code. Verify that the timeout is being set correctly when the import completes. Confirm that the condition for auto-dismissal is being met.

*Related:* US-NC5, US-NC4

---

**BUG-8 — Nextcloud import photos missing EXIF metadata**
As an editor importing photos from Nextcloud, I expect the imported photos to retain their EXIF metadata (date taken, exposure, focal length), so the metadata is preserved and usable for filtering and display.

*Current behavior:* Photos imported from Nextcloud (via US-NC4) do not have EXIF metadata extracted and stored. The `date_taken`, `exposure_time`, `focal_length`, and other EXIF fields are empty/NULL.

*Expected behavior:* Imported photos should have the same EXIF metadata extraction as photos uploaded directly (IMP-1). The metadata should be stored in the database and visible on the photo detail page.

*Technical note:* The issue is likely in the worker's download and processing logic (`worker/src/worker.js` for US-NC4). The existing EXIF extraction (from IMP-1) uses a library like `exif-parser` or similar to read metadata from the image buffer. The Nextcloud import job may be skipping this step or not passing the file buffer correctly.

*Investigation needed:* Check `worker/src/worker.js` step that downloads the file from Nextcloud. Verify that it passes the buffer to the same EXIF extraction logic used for direct uploads. Confirm that metadata is being stored in the `photos` table columns (`date_taken`, `exposure_time`, `focal_length`, etc.).

*Related:* US-NC4, IMP-1, US-P1

---

**BUG-9 — Nextcloud buttons on photo detail page have identical behavior**
As a viewer or editor, I expect the "Open in Nextcloud" and "Download original" buttons on the photo detail page to perform different actions, so I can either browse the Nextcloud folder or download the original file.

*Current behavior:* Both buttons link to the Nextcloud folder URL and open in a new tab, performing the same action.

*Expected behavior:* 
- "Open in Nextcloud" should open the Nextcloud folder in a new tab (showing the folder contents)
- "Download original" should trigger the download of the original image file from Nextcloud

*Technical note:* The "Download original" button should link to the direct file URL. If `nextcloud_url` is a folder share (e.g., `https://cloud.example/s/abc`), it needs to append the filename (e.g., `https://cloud.example/s/abc/filename.jpg`). If it's already a file share, use it directly. The button should have the `download` attribute and not use `target="_blank"`.

*Related:* US-NC2

*Status:* **FIXED in PR #124**

---

**BUG-10 — Manual people tagging button disappears**
As an editor, I expect to see the "Tag a person" button on the photo detail page so I can manually draw bounding boxes around faces and tag people in photos.

*Current behavior:* The "Tag a person" button (id="tag-person-btn") was accidentally removed during IMP-5 implementation, preventing editors from accessing the manual face tagging interface.

*Expected behavior:* The "Tag a person" button should be visible to editors (but not viewers) on the photo detail page, alongside the "Identify people" button. Both buttons serve different purposes:
- "Tag a person": Manual bbox drawing for precise face tagging
- "Identify people": AI-powered automatic identification

*Technical note:* The button should be rendered in the photo detail view template when the user has edit permissions. The JavaScript for bbox drawing and face tagging (AI-3) already exists and just needs the button to trigger it.

*Root cause:* IMP-5 consolidated tags display removed the "People in this photo" section which contained the "Tag a person" button.

*Related:* AI-3, IMP-5

*Status:* **FIXED in PR #126** — restored Tag a person button
