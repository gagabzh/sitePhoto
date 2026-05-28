# Local AI

**AI-1 — Duplicate photo detection**
As an admin, I can trigger a duplicate scan from the admin panel. The app uses a local Ollama vision model to find visually similar or identical photos across the library and presents them grouped for review. I can then delete duplicates or dismiss false positives — so the library stays clean without manual comparison.

**AI-2 — People identification and tagging**
As an editor, I can ask the app to identify people in a photo (or a batch) using a local Ollama vision model. The app suggests existing people tags (from the `people` tag category) or proposes a new tag based on the description. I confirm or reject each suggestion — so people tags are applied consistently without fully manual work.

**AI-3 — Manual person tagging**
As an editor, on the photo detail page I can draw a rectangle around a face and enter the person's name — so I can correct or add a person tag when the AI suggestion is wrong or missing.

**AI-4 — AI learns from manual tags**
As an editor, when I manually tag a person on a photo, the system stores a crop of that face as a reference example. On future identifications, the AI receives those stored examples in its prompt and uses them to recognise the same person in new photos — so identification quality improves over time without any retraining.
