/** Astro-side entry point to content: loads the collections once and builds the catalog. */
import { getCollection } from 'astro:content';
import { buildCatalog, type Catalog } from '../model/catalog';
import { iconExists } from './icons';

let catalog: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  catalog ??= (async () => {
    const [curricula, courses, lessons, learners] = await Promise.all([
      getCollection('curricula'),
      getCollection('courses'),
      getCollection('lessons'),
      getCollection('learners'),
    ]);
    const plain = <T>(entries: { id: string; data: T }[]) => entries.map(({ id, data }) => ({ id, data }));
    return buildCatalog(
      {
        curricula: plain(curricula),
        courses: plain(courses),
        lessons: plain(lessons),
        learners: plain(learners),
      },
      { iconExists },
    );
  })();
  return catalog;
}
