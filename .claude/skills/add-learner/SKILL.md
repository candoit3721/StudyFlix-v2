---
name: add-learner
description: Add a learner profile to StudyFlix (content/learners). Use when a new family member starts learning.
---

# Add a learner

1. Create `content/learners/<id>.yaml` (kebab-case id, usually the first name) with:
   - `name` and `tagline` (at most 40 characters, for example "Grade 3 star").
   - `avatar`: a friendly Lucide icon name (animals and objects work well).
     Check it exists in `node_modules/lucide-static/icons/`.
   - `accent`: a lowercase `#rrggbb` colour, light enough for dark button text.
     The catalog enforces a contrast of 4.5 and suggests picking a lighter colour if it fails.
   - `courses`: existing course ids, in the order the rows should appear.
2. `npm run validate`, then `npm run verify`.
3. Check the "Who's learning today?" page and the learner home at desktop and phone width.
