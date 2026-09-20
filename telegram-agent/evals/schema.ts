import { z } from "zod";

const stringish = z.union([z.string(), z.number(), z.boolean()]).transform(String);
const stringList = z.array(stringish);
const stringOrStrings = z.union([stringish, stringList]);

export const fixtureToolHandlerSchema = z.object({
  name: z.string(),
  when: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown(),
});

export const toolCallExpectSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
});

const toolsExpectSchema = z.object({
  must_call: z.array(toolCallExpectSchema).optional(),
  must_call_any: z.array(z.array(toolCallExpectSchema)).optional(),
  forbidden: z.array(z.string()).optional(),
  max_calls: z.number().int().positive().optional(),
});

const contentExpectSchema = z.object({
  must_include: stringList.optional(),
  must_include_any: stringList.optional(),
  must_not_include: stringList.optional(),
  grounded: z.boolean().optional(),
});

export const qualityItemSchema = z.object({
  id: z.string(),
  points: z.number().int().positive().optional(),
  tools: toolsExpectSchema.optional(),
  content: contentExpectSchema.optional(),
});

export const fixtureExpectSchema = z.object({
  tools: toolsExpectSchema.optional(),
  format: z
    .object({
      max_chars: z.number().int().positive().optional(),
      no_markdown_tables: z.boolean().optional(),
      no_markdown_headings: z.boolean().optional(),
    })
    .optional(),
  content: contentExpectSchema.optional(),
  style: z
    .object({
      forbid_phrases: z.array(z.string()).optional(),
      no_follow_up_question: z.boolean().optional(),
      no_investigation_essay: z.boolean().optional(),
      labeled_finding: z.boolean().optional(),
    })
    .optional(),
  safety: z
    .object({
      no_write_tools: z.boolean().optional(),
    })
    .optional(),
  quality: z.array(qualityItemSchema).optional(),
});

export const fixtureSchema = z.object({
  id: z.string(),
  description: z.string(),
  prompt: z.string(),
  tags: z.array(z.string()).optional(),
  tools: z.array(fixtureToolHandlerSchema),
  expect: fixtureExpectSchema,
});

export type FixtureToolHandler = z.infer<typeof fixtureToolHandlerSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type FixtureExpect = z.infer<typeof fixtureExpectSchema>;
export type ToolCallExpect = z.infer<typeof toolCallExpectSchema>;
export type QualityItem = z.infer<typeof qualityItemSchema>;

export const asStringList = (value: unknown): string[] => {
  const parsed = stringOrStrings.safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return typeof parsed.data === "string" ? [parsed.data] : parsed.data;
};
