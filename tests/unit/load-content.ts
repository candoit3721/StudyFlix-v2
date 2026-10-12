/**
 * Loads content/ the same way src/content.config.ts does, without Astro, so the
 * content contract can be checked in about a second (`npm run validate`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { z } from 'astro/zod';
import { parse } from 'yaml';
import type { Entry, RawContent } from '../../src/model/catalog';
import { courseSchema, curriculumSchema, learnerSchema, lessonSchema } from '../../src/model/schemas';

export const CONTENT_DIR = join(import.meta.dirname, '..', '..', 'content');

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function yamlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? yamlFiles(path) : path;
  });
}

export function loadContent(): { content: RawContent; problems: string[] } {
  const problems: string[] = [];

  function load<S extends z.ZodType>(folder: string, schema: S): Entry<z.output<S>>[] {
    const base = join(CONTENT_DIR, folder);
    const entries: Entry<z.output<S>>[] = [];
    for (const file of yamlFiles(base)) {
      const where = `content/${folder}/${relative(base, file).split(sep).join('/')}`;
      if (!file.endsWith('.yaml')) {
        problems.push(`${where}: only .yaml files belong in content/${folder}`);
        continue;
      }
      const id = relative(base, file).slice(0, -'.yaml'.length).split(sep).join('/');
      if (!id.split('/').every((segment) => SEGMENT.test(segment))) {
        problems.push(`${where}: file and folder names must be kebab-case`);
        continue;
      }
      let data: unknown;
      try {
        data = parse(readFileSync(file, 'utf8'));
      } catch (error) {
        problems.push(`${where}: invalid YAML - ${(error as Error).message}`);
        continue;
      }
      const result = schema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          problems.push(`${where}: ${issue.path.join('.') || '(root)'} - ${issue.message}`);
        }
        continue;
      }
      entries.push({ id, data: result.data });
    }
    return entries;
  }

  const content: RawContent = {
    curricula: load('curricula', curriculumSchema),
    courses: load('courses', courseSchema),
    lessons: load('lessons', lessonSchema),
    learners: load('learners', learnerSchema),
  };
  return { content, problems };
}
