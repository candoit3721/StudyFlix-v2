# StudyFlix v2

A family learning portal.
Learners pick their profile, work through lessons (read, flip flashcards, try worked examples, answer quizzes, practise generated questions) and print worksheets with answer keys.
Progress is saved in the browser (localStorage) and, once a parent signs a device in to the family account, synced across devices through Supabase (see `docs/supabase-sync.md`).
The site is fully static and built with Astro.

**The core rule: study material is data, never code.**
Adding a lesson, course, learner or curriculum means adding or editing YAML under `content/`.
Code changes are only for new kinds of activity (block types), new question generators, or the platform itself.

## Commands

| Command | What it does |
|---|---|
| `npm run validate` | Checks every content file against the schemas and cross-references (about 1 second). Run after every content edit. |
| `npm test` | Unit tests: content, generators, grading, catalog, card art, progress sync and the database migration. |
| `npm run lint` | Biome lint and format check. `npm run format` fixes formatting. |
| `npm run check` | TypeScript and Astro type check. |
| `npm run build` | Static build into `dist/`. Fails on any content problem. |
| `npm run test:e2e` | Playwright on desktop and phone: learner journeys, print, every-page crawl, axe accessibility. Needs a build first. |
| `npm run verify` | All of the above, in order. This is the merge gate. |
| `npm run dev` | Dev server. Agents start it with `npx astro dev --background` and stop it with `npx astro dev stop`. |

## Repository map

```
content/                 all study material (YAML), the only place content lives
  curricula/<id>.yaml    official curriculum: strands and expectations, quoted verbatim
  courses/<id>.yaml      a course: subject, optional curriculum, ordered units listing lesson slugs
  lessons/<course>/<slug>.yaml   a lesson: metadata plus an ordered list of blocks
  learners/<id>.yaml     a learner profile: name, avatar icon, accent colour, courses
src/
  model/schemas.ts       THE content contract (Zod). Strict: unknown fields fail.
  model/catalog.ts       cross-file checks and the resolved view used by pages
  blocks/                one component per block type: screen/, PrintBlock.astro, PrintKey.astro
  generators/            practice question generators (pure, seeded, answers computed)
  items/                 shared item rendering, grading and the <sf-items> client
  lib/                   markdown+KaTeX, icons (Lucide), card art, progress cache, rng
  lib/sync/              progress sync with Supabase: config, pure model, outbox, engine
  pages/                 routes; pages never contain study material
  styles/                design tokens and component styles (global.css, blocks.css, print.css)
supabase/migrations/     database schema for progress sync (tables, view, Row Level Security)
docs/                    supabase-sync.md: how progress sync works and its one-time setup
tests/unit/              Vitest, including the fast content validator and the PGlite migration test
tests/e2e/               Playwright, with an in-memory fake Supabase backend for sync journeys
factory/                 software factory profile, reviewer lenses and backlog
.claude/skills/          recipes: add-lesson, add-course, add-learner, add-generator, add-block-type
```

## Content model

- A **learner** takes **courses**.
  A course optionally follows a **curriculum** and has **units**, and each unit lists **lessons** in order.
- A **lesson** is a sequence of **blocks**.
  The block types are a closed set:

| Block | Purpose | Graded |
|---|---|---|
| `explainer` | Markdown teaching text (GFM tables, `$math$`, `$$display math$$`) | no |
| `example` | Worked example revealed step by step | no |
| `flashcards` | Key words that flip to their meaning | no |
| `quiz` | Hand-written items: `choice`, `number`, `text` | each item |
| `practice` | Items from a generator, with "New set" | once `count` answers are in |

- Every lesson needs at least one graded block.
  A lesson is complete when every quiz item is answered correctly and every practice block has `count` answers.
- Lessons in a course with a curriculum must list `expectations` (codes such as `B2`) that exist in that curriculum.
  Courses without a curriculum (enrichment, hobbies) must not list any.
- Printable worksheets (`/worksheet/`) and answer keys (`/answer-key/`) are generated from the same lesson.
  Practice sets on paper and on screen are seeded by the lesson id, so they always match.
- Card and hero art is generated from the id, subject palette and Lucide icon.
  Never add images for cards.

Read `src/model/schemas.ts` for every field.
The schema comments are the reference.

## Content standards

- Audience: Ontario learners.
  Use Canadian spelling (colour, centre, metre, practise as a verb, practice as a noun) and metric units.
- Write to the learner directly, warmly, in short sentences.
  One idea per paragraph.
- Facts must be correct and checkable.
  Curriculum text is quoted verbatim from the source named in the curriculum file; never paraphrase it or invent codes.
- Every `choice` item has exactly one correct answer, and the distractors are plausible.
- `number` items use `tolerance` only when the answer is genuinely approximate.
- `text` items list every reasonable spelling in `accept`.
- Add an `explanation` whenever the reason is not obvious.
- Prefer a generator over hand-written items for skills that need many repetitions.

## Code standards

- TypeScript strict.
  Biome formatting (single quotes, 2 spaces, 110 columns).
- Pages compose components and read from `getCatalog()`.
  They never embed study material.
- Styles use the tokens in `src/styles/global.css`.
  Add new tokens or component classes there instead of one-off values in pages.
- Client interactivity uses small custom elements (`<sf-items>`, `<sf-steps>`, `<sf-lesson-status>`, `<sf-continue>`).
  No UI framework.
- Wrap every `localStorage` access in try/catch (see `src/lib/progress.ts`).
- Pages read progress synchronously from `src/lib/progress.ts`; only `src/lib/sync/engine.ts` talks to Supabase, and it loads `@supabase/supabase-js` lazily.
  Never commit a `.env` file or a real Supabase URL or key (see `docs/supabase-sync.md`).
- Progress keys must stay stable: block `id`s and quiz prompts identify progress.
  Changing a block id or a prompt resets that progress, which is acceptable but should be deliberate.
- Generators are pure and seeded, compute their answers, and use plain-text prompts.
  `tests/unit/generators.test.ts` covers every generator automatically; add a brute-force answer test for each new one.
- UI must work at 390 px wide with no sideways scrolling, pass axe (WCAG 2 AA), and print cleanly on US Letter.

## Definition of done

1. `npm run verify` passes.
2. Any changed page was looked at in a real browser at desktop and phone width, and nothing looks off.
3. New content appears in the right places: learner home, course page, lesson page, worksheet, answer key, curriculum coverage.
4. Commits are small, with conventional messages (`feat(content): ...`, `feat(blocks): ...`, `fix: ...`).

## Software factory

New features and new material go through the factory:
`/factory:new <request>`, or `/factory:next` to take the next item from `factory/backlog.md`.
Other commands are `/factory:status`, `/factory:approve <id>`, `/factory:rework <id> <note>`, `/factory:discard <id>` and `/factory:dashboard`.
`factory/profile.md` holds this project's factory settings, and `factory/reviewers/` holds the review lenses.

## Astro documentation

Full documentation: https://docs.astro.build.
Consult these guides before working on related tasks:

- [Routing](https://docs.astro.build/en/guides/routing/)
- [Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Styling](https://docs.astro.build/en/guides/styling/)
