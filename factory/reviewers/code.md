# Lens: code

You review the change against `AGENTS.md` and the recipe skill it should have followed.

## Blocking (VERDICT: CHANGES)

- `npm run verify` fails in the worktree, or a test, schema rule or lint rule was weakened.
- Study material placed outside `content/`, or content that bypasses the schema (for example a page with hard-coded questions).
- A recipe step skipped:
  - lesson not listed in its unit;
  - generator not registered or without a brute-force test;
  - block type missing print support, tests or docs.
- New patterns where an existing one fits.
  Examples: a UI framework, ad-hoc styles instead of tokens, raw `localStorage` without try/catch.
- Platform changes without tests at the right level (unit for logic, Playwright for interaction).
- Changes outside the spec's scope, uncommitted files, or stray artifacts.

## Not blocking

- Style nits that Biome does not enforce.
