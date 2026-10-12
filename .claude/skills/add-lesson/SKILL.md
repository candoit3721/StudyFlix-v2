---
name: add-lesson
description: Add or edit a StudyFlix lesson (study material) as YAML under content/lessons. Use for any new lesson, new quiz questions, flashcards, worked examples or practice in an existing course.
---

# Add a lesson

A lesson is one YAML file.
No code changes are needed.

1. **Find the course** in `content/courses/<course>.yaml`.
   If it does not exist yet, follow the `add-course` skill first.
   If the course has a `curriculum`, open `content/curricula/<id>.yaml` and pick the expectation codes the lesson teaches.
2. **Create** `content/lessons/<course>/<slug>.yaml` (kebab-case slug, unique in the course).
   Copy the shape of an existing lesson.
   Start from `content/lessons/g6-science/six-kingdoms.yaml` for a concept lesson, or `content/lessons/math-contest-club/pairing-trick.yaml` for a skill lesson with practice.
   - `title` is at most 60 characters and `summary` at most 160 characters.
   - `icon` is a Lucide icon name (https://lucide.dev/icons) that fits the topic.
     Check that it exists with `ls node_modules/lucide-static/icons/<name>.svg`.
   - `minutes` is a realistic estimate for a child.
   - `expectations` lists codes from the course curriculum, or is omitted for courses without one.
   - `objectives` are 1 to 8 "you will" statements, each something the lesson actually teaches and checks.
3. **Write the blocks** in teaching order: explainer(s), then a worked example or flashcards, then a quiz and/or practice.
   - Every block needs a unique kebab-case `id`.
   - At least one `quiz` or `practice` block is required.
   - Use a `practice` block when a generator exists for the skill (see `src/generators/index.ts`).
     If none fits and the skill needs repetition, propose a generator with the `add-generator` skill.
4. **List the lesson** in its unit in `content/courses/<course>.yaml`, in the right order.
5. **Validate**: `npm run validate`.
   The messages name the file and field; fix until green.
6. **Look at it**: `npm run build`, then check the lesson page, `worksheet/` and `answer-key/` at desktop and phone width.
   Then check the learner home row and the curriculum coverage page.
7. **Verify**: `npm run verify`.

Follow the "Content standards" in `AGENTS.md`: Canadian spelling, metric units, verbatim curriculum text, exactly one correct answer per choice item, and explanations where the reason is not obvious.
