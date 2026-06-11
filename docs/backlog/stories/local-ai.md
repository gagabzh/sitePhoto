# Local AI

**AI-1 — Duplicate photo detection**
As an admin, I can trigger a duplicate scan from the admin panel. The app uses a local Ollama vision model to find visually similar or identical photos across the library and presents them grouped for review. I can then delete duplicates or dismiss false positives — so the library stays clean without manual comparison.

**AI-2 — People identification and tagging**
As an editor, I can ask the app to identify people in a photo (or a batch) using a local Ollama vision model. The app suggests existing people tags (from the `people` tag category) or proposes a new tag based on the description. I confirm or reject each suggestion — so people tags are applied consistently without fully manual work.

**AI-3 — Manual person tagging**
As an editor, on the photo detail page I can draw a rectangle around a face and enter the person's name — so I can correct or add a person tag when the AI suggestion is wrong or missing.

**AI-4 — AI learns from manual tags**
As an editor, when I manually tag a person on a photo, the system stores a crop of that face as a reference example. On future identifications, the AI receives those stored examples in its prompt and uses them to recognise the same person in new photos — so identification quality improves over time without any retraining.

---

**AI-5 — Unified people tagging with continuous learning**
As an editor, I want a single, consistent way to tag people that merges the existing AI identification (AI-2) and manual face tagging (AI-3) into one system, so that every tag — whether AI-suggested or manually added — improves future detection accuracy.

**Acceptance criteria:**

1. **Unified data model**: All people tags (whether from AI identification or manual face selection) are stored in the same system and contribute to the same learning dataset. The `person_faces` table (or equivalent) is the single source of truth for known people.
2. **Manual tagging improves AI**: When I use "Tag a person" (AI-3) to manually select a face and name a person, that face crop is automatically added to the reference dataset for that person, and immediately used for future AI identifications.
3. **AI suggestions use learned data**: When AI-2 identifies people in a photo, it uses all previously tagged face crops (from both manual tags and confirmed AI suggestions) as reference examples in its prompt, not just static descriptions.
4. **Consistent tagging interface**: There is one primary interface for people tagging that combines:
   - AI-suggested people (with face bounding boxes highlighted)
   - Ability to confirm/reject AI suggestions
   - Ability to manually add a person by selecting a face
   - All operations update the same underlying data
5. **Learning feedback loop**: Each confirmed AI suggestion (accepted by user) and each manual tag addition updates the reference dataset for that person, improving future recognition.
6. **Description field integration**: The description field on people tags is used as supplementary context but not as the primary matching mechanism. Face crops are the primary reference.
7. **Photo upload identification**: When photos are uploaded, the system attempts to identify people using the unified dataset (face crops + descriptions), and suggests tags that can be confirmed or rejected.
8. **"Identify people" action**: The "Identify people" button triggers a re-scan of the photo using the current unified dataset, suggesting people that can be confirmed or rejected.

**Error states:**
- AI identification fails or times out: show "Could not identify people" but allow manual tagging.
- Manual face selection fails (no face detected in region): show "No face found in selection, try again."
- Network error during identification: show retry option.
- Face crop storage failure: log error, continue with tagging but warn user that learning may not work.

**Edge cases:**
- Same person tagged with slightly different names (e.g., "John" vs "John Doe"): system should recognize as same person or prompt for merging.
- Multiple people with same name: system distinguishes by face crops, not just name.
- Photo with many faces: all detected faces can be tagged individually.
- Person appears in photo without their face visible (back of head, profile): manual tagging still works, but may not improve AI recognition.
- Person's appearance changes significantly over time: newer face crops take precedence in prompt.

**Access control:**
- Only editors and admins can tag people (manual or confirm AI suggestions).
- Viewers can see people tags but cannot add or modify them.
- All people tags are associated with the user who created them.

**Test data:**
- User with 5 photos of the same person (various angles/lighting) — verify face crops are stored and used for identification.
- Photo with 3 people — verify all can be tagged individually.
- User adds manual tag for "Alice", then uploads new photo of Alice — verify AI suggests "Alice" based on learned face crops.
- User rejects AI suggestion — verify this negative feedback is recorded (if implemented).

**Browser/device support:** Desktop (Chrome, Firefox, Safari) and mobile (iOS Safari, Android Chrome). Face selection must work with touch on mobile.

> **Technical notes:**
>
> **Data model changes:** May need to unify the current separate storage for AI descriptions and manual face crops. Consider using a single `people` table with face crop references.
>
> **Current state analysis:**
> - AI-2 uses description field comparison (not learning effectively)
> - AI-3 stores face crops in `person_faces` table but doesn't integrate with AI-2
> - AI-4 attempts to use face crops in prompts but may not be fully functional
>
> **Prompt engineering:** The Ollama vision model prompt should include:
> - Text description of the person (if available)
> - Base64-encoded face crop images as reference
> - Instruction to match both appearance and context
>
> **Face crop storage:** Use existing `person_faces` table (v15 migration) which stores `user_id`, `person_name`, `crop_s3_key`, `photo_id`, `bounding_box`.
>
> **Unification strategy:**
> 1. When AI-2 identifies a person, store the detected face crop in `person_faces` (if confirmed by user)
> 2. When AI-3 manually tags a person, ensure it's stored in `person_faces` with crop
> 3. When AI-4 runs, include all face crops for a person in the prompt
> 4. Gradually phase out description-only matching in favor of face-based matching
>
> **Migration:** Existing description-based tags should be migrated to include face crops where possible. Photos already tagged with descriptions but no crops should trigger a background job to extract face crops.
>
> **Out of scope:** Retraining the base Ollama model. Real-time learning across all users (per-user learning only). Face recognition as a separate service. Video person detection.

---

**AI-6 — People tag autocomplete**
As an editor, when I tag a person on a photo (manually or confirming an AI suggestion), I see an autocomplete dropdown of existing people tags matching what I've typed — so I can quickly select the correct person without typos and maintain consistent naming.

- The autocomplete is available in all people tagging interfaces:
  - Manual face tagging (drawing a rectangle and entering a name)
  - Confirming/rejecting AI-suggested people tags
  - Editing existing people tags on a photo
- Autocomplete matches against existing people names in the database (from `people` table or `person_faces` table)
- Matching is case-insensitive and prioritizes:
  1. Exact matches first
  2. Prefix matches (typing "Joh" shows "John", "Johnny", "Joseph")
  3. Substring matches (typing "oh" shows "John", "Doherty")
- The autocomplete dropdown shows up to 10 matching people names
- Selecting a suggestion from the dropdown auto-fills the name field
- The autocomplete endpoint is `/api/people/autocomplete?query=...` returning JSON array of `{id, name}` objects
- Minimum 2 characters typed before suggestions appear
- Keyboard navigation works (arrow keys, Enter to select, Esc to close)
- Mobile-friendly: dropdown is touch-friendly with adequate tap targets

Edge cases:
- User types a name that doesn't exist: autocomplete shows "No matching people. [Create new person]" option
- Multiple people with similar names: all are shown with their full names
- User has permission to tag but can only see people they've previously tagged: autocomplete filters to people the user has access to
- Same person exists with different capitalizations (e.g., "john", "John", "JOHN"): deduplicate in results

> **Technical notes:**
> - Reuse existing autocomplete pattern from TG-2 (tag autocomplete) for consistency
> - Backend: query `SELECT DISTINCT name FROM person_faces ORDER BY name` with LIKE matching
> - Frontend: reuse autocomplete JS/CSS components from existing tag autocomplete
> - Consider caching autocomplete results for common prefixes
