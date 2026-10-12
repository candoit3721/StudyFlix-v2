# StudyFlix backlog

`/factory:next` takes the first unchecked item.
Merged items are checked off automatically.

- [x] Add a Grade 6 science lesson "Vertebrates and Invertebrates" to the Biodiversity unit: the five vertebrate classes with Ontario animals, common invertebrate groups, flashcards and a sorting quiz (expectation B2). (001-grade-6-vertebrates-and-invertebrates-le)
- [x] Add a Grade 6 science lesson "Invasive Species in the Great Lakes" to the Biodiversity unit: zebra mussels and sea lamprey, how they disrupt food webs, and what Ontarians do about it (expectation B1). (002-grade-6-invasive-species-lesson)
- [ ] Add a "Flight" unit to Grade 6 Science with a first lesson "The Four Forces of Flight": lift, weight, thrust and drag, with a worked example and a quiz (expectation D2).
- [ ] Add a learner Olivia (Grade 3) with a new "Grade 3 Money" enrichment course: a money generator (counting Canadian coins and making change, in dollars and cents) and a first lesson that uses it.
- [ ] Add a "fraction of a quantity" generator and a Math Contest Club lesson that practises it.
- [ ] Port the v1 Grade 6 percents drill (StudyFlix v1 `sophia-math` preset `g6_percentages`) to the Grade 6 Math course: a seeded generator for percent of a quantity and what percent one number is of another, and a lesson that uses it. Drop sales tax and discounts unless the Grade 6 curriculum covers them. Needs the Grade 6 Math course from job 004.
- [ ] Port the v1 Grade 6 equations drill (`g6_equations`) to the Grade 6 Math course: a seeded generator for solving equations with whole numbers, and a lesson that uses it. Keep only the equation forms the Grade 6 curriculum covers. Needs the Grade 6 Math course from job 004.
- [ ] Port the v1 Grade 6 integers drill (`g6_integers`) to the Grade 6 Math course: a seeded generator and a lesson on reading, representing, comparing and ordering integers. Integer arithmetic is only included if the Grade 6 curriculum covers it. Needs the Grade 6 Math course from job 004.
- [ ] Port the v1 Grade 6 statistics drill (`g6_statistics`) to the Grade 6 Math course: a seeded generator for mean, median and mode of small data sets, and a lesson that uses it. Needs the Grade 6 Math course from job 004.
- [ ] Port the v1 Grade 6 area drills (`g5_6_geometry_area` and `g6_composite_shapes`) to the Grade 6 Math course: a seeded generator for the area of parallelograms, triangles and composite shapes made of them, and a lesson that uses it. Drop shapes outside the Grade 6 curriculum, such as circles. Needs the Grade 6 Math course from job 004.
- [ ] Fix `text` item grading for answers with punctuation: `normalizeText` in `src/items/grading.ts` strips punctuation, so "12:5" and "1:25" both normalize to "125" (a wrong answer is marked right) and "12 : 5" does not match "12:5". Reproduce in the browser first, then fix with a regression test.
- [ ] Fix the quiz answer reveal wording: after two wrong answers it shows "The answer is It often ..." or "The answer is No, ..." with a capital letter mid-sentence, on every lesson (`src/items/client.ts`). Make the reveal read naturally for answers that are full sentences as well as short ones.
- [ ] Fix flashcard backs with inline Markdown (bold, math such as a fraction): the card face uses `display: grid`, so each inline piece breaks onto its own line. Reproduce in the browser, fix in `src/styles/blocks.css` with a regression test, and check every existing flashcard lesson at desktop and phone width.
- [ ] Accept a typed unit in `number` answers: a learner who types "90 km/h" into a box that already shows "km/h" is marked wrong. Accept the item's own unit (and common spellings) after the number, with grading tests.
- [ ] Clear the `astro check` deprecation hint: `.finite()` is deprecated in `src/model/schemas.ts`. Replace it with the current Zod equivalent without changing what content is accepted.
