---
base_branch: main
max_rounds: 2
setup: npm ci --prefer-offline --no-audit --no-fund
verify: npm run verify
preview: npm run build && npx astro preview --port $FACTORY_PORT --ignore-lock
reviewers: [pedagogy, experience, code]
model_pedagogy: opus
model_experience: sonnet
model_code: sonnet
---

# StudyFlix factory profile

The front matter is read by the board script.
The sections below are read by the agents.
Read `AGENTS.md` first; it is the source of truth for how StudyFlix works.

## Lanes

- **content**: the diff changes only files under `content/`.
  This covers new lessons, quiz items, flashcards, worked examples and practice blocks using existing generators.
- **platform**: anything else, including:
  - `src/` (block types, generators, pages, styles);
  - `tests/`;
  - configuration and dependencies;
  - `factory/` and `.claude/`.

Prefer the content lane.
When a request needs both lanes (for example a new generator plus lessons that use it), do it as one job in the platform lane.

## Escalation rules (the approver applies these literally)

Escalate to a human when **any** of these is true:

1. The change is in the **platform** lane.
2. It adds a new **learner**, **course** or **curriculum** file.
   New topics get a parent's eyes first.
3. It deletes or renames a lesson, or changes a block `id` or a quiz `prompt` in an existing lesson.
   This resets children's saved progress.
4. It adds curriculum expectation text, or the pedagogy review noted any fact it could not confirm.
5. The diff touches files outside the spec's scope.

Otherwise (new or improved lessons inside an existing course, all reviews PASS, verify succeeded) the job **auto-merges**.

## Conventions for every agent

- Study material is data: content goes in `content/` YAML, never in pages or components.
- Follow the recipe skills in `.claude/skills/` (add-lesson, add-course, add-learner, add-generator, add-block-type).
- Canadian spelling, metric units, Ontario context, and verbatim curriculum text.
- Run `npm run validate` after every content edit, and `npm run verify` before finishing.
- UI is checked in a real browser at 1280 px and 390 px.
  Start it with `npm run build && npx astro preview --port <free port> --background` from the worktree; stop it with `npx astro preview stop`.
