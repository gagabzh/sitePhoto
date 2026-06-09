# Bugs

**BUG-1 — Tag autocompletion missing on Nextcloud import form**
As an editor, when I enter tags in the Nextcloud import form, I expect to see a dropdown of existing tags matching what I've typed (reusing TG-2 autocomplete functionality), so I can reuse consistent tags rather than creating near-duplicates.

*Current behavior:* The tag input field on the Nextcloud import form (`#nc-tags` in `src/routes/nextcloudImport.js`) is a plain text input with no autocomplete functionality.

*Expected behavior:* The tag input should integrate with the existing `/tags/autocomplete` endpoint (TG-2) to provide the same autocomplete experience as other tag inputs in the application.

*Technical note:* The autocomplete should trigger on input, query `/tags/autocomplete?q=<query>`, and display matching tags in a dropdown. The selected tag(s) should be comma-separated as per the current implementation. This requires adding JavaScript to `importFormScript()` in `src/routes/nextcloudImport.js` similar to the tag autocomplete implementation in `src/layout/page.js` (line 141) and `src/components.js`.

*Related:* TG-2 (Tag autocomplete endpoint already exists and works correctly)

---
