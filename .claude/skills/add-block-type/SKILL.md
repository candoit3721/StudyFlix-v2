---
name: add-block-type
description: Add a new kind of lesson activity (block type) to StudyFlix, such as a lab or sorting game. Platform change; always needs human approval.
---

# Add a block type

Block types are a closed set on purpose.
First check that no existing block (`explainer`, `example`, `flashcards`, `quiz`, `practice`) can do the job.
A new block must be reusable across many lessons, not a one-off for one lesson.

Every block type implements all of these, in one change:

1. **Schema**: a strict Zod object in `src/model/schemas.ts`.
   Add it to `blockSchema` and `BLOCK_TYPES`, with an `id`, an optional `title` and documented fields.
2. **Catalog rules** in `src/model/catalog.ts` for any cross-file checks.
   If it is graded, update both `gradedUnits` and `lessonRequirements` (`src/model/requirements.ts`).
3. **Meta**: a label and Lucide icon in `src/blocks/meta.ts`.
4. **Screen**: `src/blocks/screen/<Type>.astro`, registered in `src/blocks/Block.astro`.
   Any interactivity goes in a small custom element.
   Record progress through `src/lib/progress.ts` only.
5. **Print**: a branch in `src/blocks/PrintBlock.astro`, and in `src/blocks/PrintKey.astro` if graded.
6. **Styles** in `src/styles/blocks.css` using existing tokens; print rules in `print.css`.
7. **Tests**:
   - schema and catalog unit tests;
   - a Playwright journey in `tests/e2e/journey.spec.ts`;
   - add a page using it to the axe list in `tests/e2e/site.spec.ts`.
8. **Docs**: the block table in `AGENTS.md` and the `add-lesson` skill.
9. **Use it** in at least one real lesson.

Then run `npm run verify`.
Review the screen at desktop and phone width, keyboard-only, and in print preview.
