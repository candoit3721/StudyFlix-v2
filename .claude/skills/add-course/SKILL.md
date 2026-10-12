---
name: add-course
description: Add a new StudyFlix course (and, if needed, its curriculum file) under content/. Use when material does not belong in any existing course.
---

# Add a course

1. **Curriculum (optional).**
   If the course follows an official curriculum that is not in `content/curricula/` yet, add `content/curricula/<id>.yaml`.
   Quote every expectation verbatim from the official source and name that source in `source`.
   Never invent or paraphrase codes or text.
   If you cannot get the verbatim text, leave the curriculum out and say so in the job notes, so a human can supply it.
   Enrichment or hobby courses have no curriculum.
2. **Course.** Create `content/courses/<id>.yaml` with `title`, `subject` (a key of `SUBJECTS` in `src/lib/subjects.ts`), optional `curriculum`, `summary` (at most 200 characters) and at least one unit.
   A unit has an `id`, a `title` and the lesson slugs in order.
3. **Lessons.** Add at least one lesson with the `add-lesson` skill.
   The catalog rejects units that list missing lessons.
4. **Learner.** Add the course id to the right learner in `content/learners/<id>.yaml`.
   A course no learner takes fails validation.
5. `npm run validate`, then `npm run verify`.
   Check the learner home, the course page and (with a curriculum) the coverage page.

A new subject needs a palette in `src/lib/subjects.ts`; that is a platform change.
