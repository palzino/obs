import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fixtureSchema, type Fixture } from "./schema.ts";

export const loadFixtures = async (
  dir: string,
  only?: string,
  tags?: string,
): Promise<Fixture[]> => {
  const wanted = only
    ? new Set(only.split(",").map((id) => id.trim()).filter(Boolean))
    : undefined;
  const wantedTags = tags
    ? new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))
    : undefined;
  const names = (await readdir(dir))
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .toSorted();

  const fixtures: Fixture[] = [];
  for (const name of names) {
    const text = await Bun.file(join(dir, name)).text();
    const parsed = fixtureSchema.safeParse(Bun.YAML.parse(text));
    if (!parsed.success) {
      throw new Error(`${name}: ${parsed.error.message}`);
    }
    if (wanted && !wanted.has(parsed.data.id)) {
      continue;
    }
    if (wantedTags && !parsed.data.tags?.some((tag) => wantedTags.has(tag))) {
      continue;
    }
    fixtures.push(parsed.data);
  }

  if (wanted) {
    const missing = [...wanted].filter((id) => !fixtures.some((fixture) => fixture.id === id));
    if (missing.length > 0) {
      throw new Error(`no fixture with id ${missing.join(", ")}`);
    }
  }
  if (wantedTags && fixtures.length === 0) {
    throw new Error(`no fixtures tagged ${[...wantedTags].join(", ")}`);
  }
  return fixtures;
};
