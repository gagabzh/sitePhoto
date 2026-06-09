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

**BUG-2 — No debouncing on tag autocomplete input in Nextcloud import form**
As an editor using the Nextcloud import form, I expect the tag autocomplete to be responsive but not make excessive network requests, so that the interface feels fast and doesn't overload the server.

*Current behavior:* The autocomplete in `src/routes/nextcloudImport.js` (lines 128-133) triggers a fetch request on every keystroke with no debouncing.

*Expected behavior:* Input should be debounced (e.g., 300ms) to reduce unnecessary network requests while typing.

*Technical note:* Add a debounce mechanism to the input event listener. Can reuse the pattern from other debounced inputs in the codebase or implement a simple setTimeout/clearTimeout approach.

*Related:* BUG-1, TG-2

---

**BUG-3 — Extra leading space when inserting tag from autocomplete in Nextcloud import**
As an editor using tag autocomplete on the Nextcloud import form, I expect selected tags to be formatted cleanly without extra spaces, so my tag list looks professional.

*Current behavior:* In `src/routes/nextcloudImport.js` line 118, the `pick()` function adds a leading space: `parts[parts.length - 1] = ' ' + s;`, resulting in tags like " paris, vacation" instead of "paris, vacation".

*Expected behavior:* Tags should be inserted without extra leading spaces. Consider: `parts[parts.length - 1] = s;`

*Technical note:* Simple fix in the pick() function. Also consider trimming the last part before insertion to handle cases where user has typed spaces.

*Related:* BUG-1, TG-2

---

**BUG-4 — No loading state indicator for tag autocomplete in Nextcloud import**
As an editor using the tag autocomplete, I expect visual feedback while waiting for suggestions, so I know the feature is working and not broken.

*Current behavior:* No loading indicator is shown between typing and autocomplete results appearing in `src/routes/nextcloudImport.js`.

*Expected behavior:* Show a loading spinner or placeholder text while waiting for the `/tags/autocomplete` response.

*Technical note:* Add a loading state element to the `tag-ac-wrap` div and toggle its visibility during the fetch operation.

*Related:* BUG-1, TG-2

---

**BUG-5 — Duplicate tags can be added via autocomplete in Nextcloud import**
As an editor using tag autocomplete, I expect to avoid accidentally adding the same tag multiple times, so my tags remain clean and organized.

*Current behavior:* The autocomplete in `src/routes/nextcloudImport.js` (lines 116-121) does not check if a tag already exists in the input before adding it.

*Expected behavior:* If the user selects a tag that already exists in the input field, it should not be added again.

*Technical note:* In the `pick()` function, check if the selected tag already exists in the input value before appending it. Consider case-insensitive comparison.

*Related:* BUG-1, TG-2
