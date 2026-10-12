# StudyFlix v2

A family learning portal: pick who is learning, work through lessons, practise with fresh questions, and print worksheets with answer keys.

- **All study material is YAML** in `content/`, checked against a strict schema.
- **Lessons are built from a fixed set of blocks**: explainer, worked example, flashcards, quiz and practice.
- **Every lesson is also a printable worksheet and answer key.**
- **Progress stays in the browser.**

```bash
npm install
npm run dev       # http://localhost:4321
npm run verify    # lint, types, unit tests, build, browser tests
```

New material and features are added through the software factory (`/software-factory:factory <request>`).
See `AGENTS.md` for how everything fits together, and `factory/` for the factory profile and backlog.
