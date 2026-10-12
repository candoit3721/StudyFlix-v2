# Software Factory: Concept and StudyFlix Adoption Plan

> **Status (2026-10-12):** this was the first analysis.
> The decision since then was to build StudyFlix v2 as a new codebase (`../StudyFlix-v2`) with content-as-data from day one, instead of refactoring v1.
> The factory itself is the plugin in this repository; see `README.md`.
> Sections 1 and 5 still describe the concept; sections 2 to 4 describe v1 and are kept for reference.

Source: "Build Your Own AI Software Factory with Claude Code" (ZazenCodes, 28 min, https://www.youtube.com/watch?v=ctoaIC4LHmI).
Target: `/Users/henryw/project/workdir/StudyFlix` first, then any other project.

## 1. The concept from the video

### 1.1 What a software factory is

The term goes back to 1968 (Bob Bemer, GE): a programming environment with standardized tools plus historical data for management and measurement.
It evolved through reusable templates and frameworks (2000s), then CI/CD (2010s), and now agent factories.
The quote the video builds on: what is new is the automation of relatively unstructured cognitive work *between deterministic stages*, including writing the code itself.
The basic loop is: a trigger, then agents produce a change request, then a human (or an approver) merges it.

### 1.2 The pipeline built in the video

```
 feature request / backlog item
            |
            v
   [spec-writer (Opus)] ---> factory/<job-id>/spec.md (acceptance criteria)
            |
            v
   [builder (Opus)] -------> branch factory/<job-id>, commits, build.md
            |
            v
   +---- parallel review round N ----+
   | security | UX | UI | code       |  each writes review-<kind>.md
   +---------------------------------+  first line: VERDICT: PASS | CHANGES
            |
     any CHANGES? --yes--> builder resumed with feedback (max 2 rounds)
            | no
            v
   [approver (Opus)] ---> APPROVE: auto-merge to main
                     \--> ESCALATE: needs-human, waits for /factory approve
```

### 1.3 How it is implemented (very little code)

- **Orchestrator = a project skill** (`.claude/skills/factory/SKILL.md`, ~180 lines).
  The main Claude session runs the loop, spawns every agent, and is the only writer of `factory/board.json`.
  It never writes code, specs, or reviews itself.
- **Workers = subagents** in `.claude/agents/*.md`: spec-writer, builder, approver, and four reviewers, each with its own model.
- **State = plain files** in `factory/`:
  - `board.json` holds every job's stage, round, and reviewer verdicts.
  - `factory/<job-id>/` holds `spec.md`, `build.md`, `review-*.md`, and `decision.md`.
  - `backlog.md` is the queue for `/factory next`.
  - Job state is git-ignored (temporary runtime data).
- **Commands**:
  - `/factory <feature>` runs a new job through the loop.
  - `/factory next` takes the first unchecked backlog item.
  - `/factory approve <job-id>` merges a needs-human job.
  - `/factory rework <job-id> <note>` sends a job back to the builder.
- **Dashboard** = one self-contained `factory/dashboard.html` served by `python3 -m http.server`, which shows job cards moving Spec, Build, Review, Approve, Merged or Needs-human.
- **Rules that make it robust**:
  - Agents get context from files, never from the conversation, and write only their own file.
  - Each review starts with a machine-readable `VERDICT:` line.
  - There is a hard round cap (2), after which the job escalates instead of looping forever.
  - Escalation rules are repo-specific (billing, access control, and so on in the video).
- **Parallelism** comes from git worktrees, one per job, so several jobs run at once.
- **The bootstrap prompt was generic**: one prompt produced the whole factory for an arbitrary repo, and the agent tailored the repo-specific parts (commands, conventions, escalation rules).

### 1.4 Lessons from the live demo

- Opus as orchestrator and as approver; cheaper models are acceptable for some reviewers.
- The approver escalated more than needed at first, so the guardrails need tuning over time.
- The merge failed when `main` had uncommitted factory metadata, so the factory's own files must never block a merge.
- The factory is the most important code in the repo, so improve it with your best model.
- Next steps named in the video:
  - other triggers (GitHub Issues, Slack)
  - production signals (Sentry, metrics)
  - post-deploy monitoring with rollback
- Cost is real: subagents pass context around, so it uses more tokens than a single session.
- The author's core advice: own a small, understandable factory rather than adopting a giant third-party one.

## 2. Why StudyFlix needs a "factory floor" first

A factory only works when it makes standard parts.
Today every StudyFlix addition is a hand-built one-off, so agents would reproduce the inconsistency at a higher speed.

What the current repo shows:

- **The content registry is code.**
  Every card lives in the hardcoded `DEFAULT_PROFILES` array in `app.js` (1396 lines).
- **Studios use two folder conventions.**
  `sophia-rome/`, `sophia-science/` and `mama/` are flat, while `sophia-math/`, `olivia-math/` and `yaya/` use `js/ css/ worksheets/`.
- **Learning content is buried in studio code.**
  Examples: `QUIZ_QUESTIONS`, `ELEMENTS` and `MONUMENT_DETAILS` constants.
  The same concept has different shapes across studios (an object in rome and science, an array in mama).
- **Worksheets live in three places:** `worksheets/`, numbered folders, and top-level `00_*.md`.
- **A typical feature touches 8 to 19 files:**
  - registry card
  - key art in `assets/sf/keyart.js`
  - icon
  - studio HTML, with a cache-buster
  - studio `app.js` routing
  - engine or lab module
  - CSS
  - worksheet
  - print manifest
  - spec
  - README
  - backlog JSON
- **No content schema or validation**, no `npm` scripts, no lint.
- **Uneven test coverage.**
  The print-regression suite is strong, but there are no UI tests for yaya, mama, sophia-rome or sophia-science, and no unit tests for the engines.
- **Docs drift:**
  - README and DEPLOYMENT point to a non-existent `kids/` path and Netlify/Vercel, while the real deploy is GitHub Pages.
  - `curriculum_backlog.json` says it was "Generated by the 5-phase pipeline in CLAUDE.md", but no CLAUDE.md exists.
- **Cache-busters are out of sync:** `?v=3.2.0`, `?v=1.0.0` and `?v=2.1.0` all appear, while `APP_VERSION = "3.1.0"`.

The good news is that StudyFlix already has the two most important factory ingredients.
`CURRICULUM_STYLE_GUIDE.md` is a quality standard, and `curriculum_backlog.json` is a structured backlog tied to Ontario expectations.

## 3. Target design for StudyFlix

### 3.1 Product lines (the standard parts)

Define a small, closed set of learning-material types.
Each type gets a schema, a template, a recipe, and acceptance checks.
A new piece of content then becomes data plus, at most, one new module.

| Product line | What it is | Lives in | Validated by |
|---|---|---|---|
| `card` | Hub entry (quest, lesson, printable) | `content/<profile>.json` | JSON Schema plus a link-target check |
| `quiz-bank` | Multiple-choice or short-answer questions | `<studio>/content/quizzes/*.json` | Schema, a unique-answer check, and a UI spec |
| `worksheet` | Printable Markdown with an answer key | `<studio>/worksheets/*.md` | Template sections (style guide section 6) and the print manifest |
| `generator` | Random question engine | `<studio>/js/generators/*.js` | Unit tests (seeded, answer correctness) |
| `lab` | Interactive simulation tab | `<studio>/js/labs/*.js` | UI spec with screenshots |
| `studio` | A whole subject app | `<studio>/` from one template | Scaffold check and smoke spec |

Required refactors to get there (Phase 0, see section 4):

1. Move `DEFAULT_PROFILES` out of `app.js` into `content/profiles/*.json` with `content/schema/*.schema.json`.
2. Extract the inline quiz banks and fact tables into JSON files per studio, with one shared quiz renderer in `assets/sf/`.
3. Move every studio to one layout: `index.html`, `js/`, `css/`, `content/`, `worksheets/`, `README.md`.
4. Add `scripts/validate-content.mjs`, which checks schemas, links, art ids, the print-manifest coverage, and the Canadian spelling list from the style guide.
5. Use a single version source for the cache-busters, stamped by a script.
6. Add `package.json` scripts: `serve`, `validate`, `lint`, `test`, `test:print`.
7. Add `CLAUDE.md` (one line pointing to `AGENTS.md`) and an `AGENTS.md` that holds:
   - the repo map
   - the product lines
   - commands
   - conventions
   - the pointer to the style guide
8. Fix the README and DEPLOYMENT drift, delete the duplicate launchers and the Python CLI quiz, and git-ignore `__pycache__`.

### 3.2 The StudyFlix factory pipeline

This is the same shape as the video, with the stages specialized for learning content.

```
 trigger: /factory <idea> | /factory next (curriculum_backlog.json) | GitHub issue (later)
   |
   v
 [curriculum-planner, Opus]  spec.md
     - profile, grade, Ontario expectation codes (verbatim)
     - product lines to produce, files allowed to touch
     - learning objectives and acceptance criteria (testable)
   |
   v
 [builder, Opus]  in worktree factory/<job-id>
     - follows the product-line recipe, runs `npm run validate && npm test`
   |
   v
 parallel reviewers (each writes review-<kind>.md, first line VERDICT)
   - pedagogy     : grade fit, factual and math accuracy, answer keys solved independently,
                    Canadian spelling and metric units, style-guide structure
   - ui-ux        : opens the pages at desktop and phone width, screenshots, pixel review,
                    profile theme, accessibility basics
   - print        : runs the @print-smoke and manifest specs, checks for zero paper waste
   - code         : product-line conventions, no new one-off patterns, tests added
   |
   v  (CHANGES -> builder, max 2 rounds -> else escalate)
 [approver, Opus]
   - auto-merge: a new quiz-bank, worksheet or card inside an existing studio with all PASS
   - escalate:   a new studio or product line, changes to assets/sf or the hub, a new profile,
                 anything touching progress/localStorage or deploy, content for a new grade
```

Commands: `/factory <idea>`, `/factory next`, `/factory approve <id>`, `/factory rework <id> <note>`, `/factory status`.
Escalate generously at first and loosen the rules as trust grows, which is the video's own lesson.

### 3.3 Product-line recipes as skills

Each product line gets a small project skill (`.claude/skills/add-quiz-bank`, `add-worksheet`, `add-generator`, `add-lab`, `new-studio`).
The builder follows the matching recipe.
A human (or a single non-factory session) can use the same recipes directly.
This makes behaviour consistent whether a feature goes through the full factory or not.

## 4. Rollout plan

| Phase | Outcome | Done when |
|---|---|---|
| 0. Factory floor | Product-line schemas, data files, one studio layout, validate, npm scripts, AGENTS.md, drift fixed | `npm run validate && npm test` is green in CI, and content is data |
| 1. Recipes | The five product-line skills plus scaffolding scripts | Adding a quiz bank touches only data plus at most one spec |
| 2. Factory core | Orchestrator skill, 7 agents, `factory/` state, board, dashboard, worktrees | One backlog item goes from idea to auto-merge without manual edits |
| 3. Triggers | `curriculum_backlog.json` feeds `/factory next`, and GitHub Issues (label `factory`) feed it too | A parent can file an issue and get a PR or merge back |
| 4. Feedback | Learning signals (quiz misses from progress data, exported) become backlog items | The factory proposes the next worksheet from real mistakes |

Phase 0 matters most.
Skipping it means the factory automates the current mess.

## 5. Reusing the factory across projects

Split the factory into a generic kit and a per-project profile.

- **Kit** (this `Software-Factory` repo):
  - orchestrator skill
  - generic agent prompts
  - board format
  - dashboard
  - worktree handling
  - an `install` bootstrap prompt (the video's approach)
- **Project profile** (`factory/profile.md` in each project):
  - commands (build, test, validate, serve)
  - product lines and recipes
  - reviewer set
  - escalation rules
  - models per agent
- **New projects** start from a template that is already "factory shaped": schemas, validate, AGENTS.md and CI from day one.

The kit stays small and understandable, which is the video's main point.
Each project owns only its profile and recipes.

## 6. Open decisions

1. Should job state (`factory/<job-id>/`) be git-ignored as in the video, or committed for an audit trail of content decisions?
   The recommendation is to ignore it and archive finished jobs to `factory/archive/` periodically.
2. Should all kid-facing content require a human approval in the first weeks?
   The recommendation is yes for new topics, and auto-merge only for additions to an existing topic.
3. Models: Opus for the planner, builder, pedagogy reviewer and approver, and Sonnet for the UI, print and code reviewers?
4. Should Phase 0 be done as a set of small PRs or one restructuring branch?
   The recommendation is one PR per step in section 3.1, each kept green in CI.
