---
name: add-generator
description: Add a StudyFlix practice question generator (src/generators). Use when a skill needs many fresh, auto-checked questions. This is a platform change.
---

# Add a generator

1. Create `src/generators/<id>.ts` following `src/generators/gauss-sum.ts`:
   - `defineGenerator({ id, title, description, params, generate })`.
   - `params` is a strict Zod object with defaults, so `params: {}` always works.
   - `generate(rng, params)` returns one item (`number`, `choice` or `text`).
     All randomness comes from `rng`.
     Prompts and explanations are plain text (no `$`, `*`, `_`, backticks or `#`).
   - **Compute** the answer.
     Never hard-code answers.
   - Format numbers with `formatNumber` from `src/lib/format.ts`.
   - Make sure the parameter space can yield at least 30 distinct prompts.
2. Register it in `GENERATORS` in `src/generators/index.ts`.
3. Add a brute-force or independent check of its answers to `tests/unit/generators.test.ts`.
   The shared tests (schema, plain text, self-grading, determinism, param validation) cover it automatically.
4. Use it from a lesson's `practice` block (see `add-lesson`).
5. `npm run verify`, and do a few rounds of "New set" in the browser.
