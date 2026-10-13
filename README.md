# StudyFlix v2

A family learning portal: pick who is learning, work through lessons, practise with fresh questions, and print worksheets with answer keys.

- **All study material is YAML** in `content/`, checked against a strict schema.
- **Lessons are built from a fixed set of blocks**: explainer, worked example, flashcards, quiz and practice.
- **Every lesson is also a printable worksheet and answer key.**
- **Progress is saved in the browser and can sync across the family's devices** with a simple family sign-in (see `docs/supabase-sync.md`).

```bash
npm install
npm run dev       # http://localhost:4321
npm run verify    # lint, types, unit tests, build, browser tests
```

New material and features are added through the software factory (`/factory:new <request>`, `/factory:next`).
See `AGENTS.md` for how everything fits together, and `factory/` for the factory profile and backlog.

On a new machine or a fresh clone, run `npx -y github:candoit3721/software-factory` once in this folder to install the factory (see https://github.com/candoit3721/software-factory).
