import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    column: z.enum(['handbuilt-agent', 'langgraph', 'agent-systems']),
    date: z.coerce.date(),
    order: z.number(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    juejin: z.string().url().optional(),
  }),
});

export const collections = { blog };
