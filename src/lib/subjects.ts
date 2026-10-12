/**
 * Subjects and their palettes. A subject's palette drives the generated card
 * art and the accents on its course and lesson pages.
 */
export const SUBJECTS = {
  math: { label: 'Math', palette: ['#1d3b8f', '#3f6fe0', '#8fb3ff', '#ffd166'] },
  science: { label: 'Science', palette: ['#0f4c3a', '#1f8a5b', '#7fd8a6', '#f4e285'] },
  history: { label: 'History', palette: ['#5a1f1b', '#a8432f', '#e8a87c', '#f6e3b4'] },
  language: { label: 'Language', palette: ['#4a1d6b', '#8a3fb8', '#d6a6f2', '#ffe3a3'] },
  'life-skills': { label: 'Life skills', palette: ['#4a2c12', '#9a5b26', '#e3b07a', '#fbe6c8'] },
} as const satisfies Record<string, { label: string; palette: readonly [string, string, string, string] }>;

export type SubjectId = keyof typeof SUBJECTS;

export const SUBJECT_IDS = Object.keys(SUBJECTS) as [SubjectId, ...SubjectId[]];
