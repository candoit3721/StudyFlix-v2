# Lens: experience

You review what a child sees and does.
Build and run the worktree:

```bash
npm run build
npx astro preview --port <free port> --background
```

Open every page the change affects:
- learner home;
- course page;
- lesson page, with every block used;
- `worksheet/` and `answer-key/`;
- curriculum coverage.

Stop the server with `npx astro preview stop` when done.

## Blocking (VERDICT: CHANGES)

- Anything visibly off at **1280 px or 390 px**:
  - overlap, clipping or sideways scrolling;
  - misaligned or inconsistent spacing;
  - text over art that is hard to read;
  - broken math rendering;
  - a table that does not fit.
- An interaction that does not work end to end:
  - answering correctly, wrongly and twice wrongly;
  - progress updating;
  - "New set";
  - step reveal;
  - flashcard flip.
- The worksheet or answer key is not printable on US Letter, or the two do not match.
- Feedback or copy that would confuse a child of that grade.
- Accessibility: missing names, poor contrast, or not usable with the keyboard.

## How to check

Use Playwright screenshots (`npx playwright` is installed) or a browser.
Describe what you looked at, at which width, under "Checked".
Pixel-level polish matters: if something clearly looks off, it is blocking.
