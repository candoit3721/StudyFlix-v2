import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { courseSchema, curriculumSchema, learnerSchema, lessonSchema } from './model/schemas';

/** Each collection is a folder of YAML files under content/. The id is the path without `.yaml`. */
const yamlIn = (folder: string) => glob({ pattern: '**/*.yaml', base: `./content/${folder}` });

export const collections = {
  curricula: defineCollection({ loader: yamlIn('curricula'), schema: curriculumSchema }),
  courses: defineCollection({ loader: yamlIn('courses'), schema: courseSchema }),
  lessons: defineCollection({ loader: yamlIn('lessons'), schema: lessonSchema }),
  learners: defineCollection({ loader: yamlIn('learners'), schema: learnerSchema }),
};
