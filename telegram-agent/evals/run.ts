import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GrafanaAgent, type AgentTurn } from "../src/agent.ts";
import { DEFAULT_OPENROUTER_MODEL, loadEvalConfig } from "../src/config.ts";
import { loadFixtures } from "./fixtures.ts";
import { grade, gradeQuality, passed, type Check, type QualityResult } from "./graders.ts";
import { createFixtureTools } from "./mocks.ts";
import type { Fixture } from "./schema.ts";

type EvalCase = {
  fixture: string;
  model: string;
  pass: boolean;
  checks: Check[];
  qualityScore: number;
  qualityMax: number;
  quality: QualityResult["items"];
  text: string;
  tools: AgentTurn["tools"];
  usage: AgentTurn["usage"];
  costUsd: number;
  latencyMs: number;
  error?: string;
};

type ModelPrice = {
  prompt: number;
  completion: number;
};

const loadModelPrices = async (models: string[]): Promise<Record<string, ModelPrice>> => {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) {
    throw new Error(`openrouter models: ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }>;
  };
  const wanted = new Set(models);
  const prices: Record<string, ModelPrice> = {};
  for (const model of body.data ?? []) {
    if (!wanted.has(model.id)) {
      continue;
    }
    prices[model.id] = {
      prompt: Number(model.pricing?.prompt ?? 0),
      completion: Number(model.pricing?.completion ?? 0),
    };
  }
  return prices;
};

const caseCost = (usage: AgentTurn["usage"], price: ModelPrice | undefined): number => {
  if (typeof usage.cost === "number") {
    return usage.cost;
  }
  if (!price) {
    return 0;
  }
  return (usage.inputTokens ?? 0) * price.prompt + (usage.outputTokens ?? 0) * price.completion;
};

const formatUsd = (value: number): string => {
  if (value === 0) {
    return "$0";
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(3)}`;
};

const here = dirname(fileURLToPath(import.meta.url));

const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const concurrencyFromArgs = (): number => {
  const raw = argValue("--concurrency") ?? process.env.EVAL_CONCURRENCY ?? "8";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--concurrency must be a positive integer, got ${raw}`);
  }
  return value;
};

const mapPool = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
};

const modelsFromArgs = (): string[] => {
  const many = argValue("--models");
  if (many) {
    return many.split(",").map((model) => model.trim()).filter(Boolean);
  }
  const one = argValue("--model");
  if (one) {
    return [one];
  }
  return [process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL];
};

const renderReport = (cases: EvalCase[]): string => {
  const models = [...new Set(cases.map((c) => c.model))];
  const fixtures = [...new Set(cases.map((c) => c.fixture))];
  const header = ["fixture", ...models].join(" | ");
  const sep = ["---", ...models.map(() => "---")].join(" | ");
  const rows = fixtures.map((fixture) => {
    const cells = models.map((model) => {
      const result = cases.find((c) => c.fixture === fixture && c.model === model);
      if (!result) {
        return "-";
      }
      if (result.error) {
        return `err (${result.error})`;
      }
      const ok = result.checks.filter((c) => c.ok).length;
      const quality =
        result.qualityMax > 0 ? ` q${result.qualityScore}/${result.qualityMax}` : "";
      return `${result.pass ? "pass" : "fail"} ${ok}/${result.checks.length}${quality}`;
    });
    return [fixture, ...cells].join(" | ");
  });

  const failed = cases.filter((c) => !c.pass);
  const failNotes = failed.flatMap((c) => {
    const reasons = (c.error ? [`error: ${c.error}`] : c.checks.filter((check) => !check.ok).map((check) => check.detail))
      .map((detail) => `  - ${detail}`)
      .join("\n");
    return [`${c.model} / ${c.fixture}:`, reasons];
  });

  const costLines = models.map((model) => {
    const modelCases = cases.filter((c) => c.model === model);
    const passedCount = modelCases.filter((c) => c.pass).length;
    const cost = modelCases.reduce((sum, c) => sum + c.costUsd, 0);
    const tokensIn = modelCases.reduce((sum, c) => sum + (c.usage.inputTokens ?? 0), 0);
    const tokensOut = modelCases.reduce((sum, c) => sum + (c.usage.outputTokens ?? 0), 0);
    const qualityScore = modelCases.reduce((sum, c) => sum + c.qualityScore, 0);
    const qualityMax = modelCases.reduce((sum, c) => sum + c.qualityMax, 0);
    const quality = qualityMax > 0 ? `, quality ${qualityScore}/${qualityMax}` : "";
    return `${model}: ${passedCount}/${modelCases.length} pass${quality}, ${formatUsd(cost)}, ${tokensIn} in / ${tokensOut} out`;
  });
  const totalCost = cases.reduce((sum, c) => sum + c.costUsd, 0);

  const speedLines = models.map((model) => {
    const modelCases = cases.filter((c) => c.model === model);
    const n = modelCases.length || 1;
    const avgMs = Math.round(modelCases.reduce((sum, c) => sum + c.latencyMs, 0) / n);
    const avgTools = (modelCases.reduce((sum, c) => sum + c.tools.length, 0) / n).toFixed(1);
    const avgIn = Math.round(modelCases.reduce((sum, c) => sum + (c.usage.inputTokens ?? 0), 0) / n);
    const avgOut = Math.round(modelCases.reduce((sum, c) => sum + (c.usage.outputTokens ?? 0), 0) / n);
    return `${model}: avg ${avgMs}ms, ${avgTools} tools, ${avgIn} in / ${avgOut} out per case`;
  });

  return [
    `# telegram-agent eval`,
    "",
    header,
    sep,
    ...rows,
    "",
    "## cost",
    ...costLines,
    `total: ${formatUsd(totalCost)}`,
    "",
    "## speed",
    ...speedLines,
    "",
    ...failNotes,
  ].join("\n");
};

const runCase = async (
  agent: GrafanaAgent,
  fixture: Fixture,
  model: string,
  chatId: number,
  price: ModelPrice | undefined,
): Promise<EvalCase> => {
  const started = performance.now();
  try {
    const turn = await agent.run({
      chatId,
      text: fixture.prompt,
      model,
      tools: createFixtureTools(fixture),
    });
    const checks = grade(fixture, turn);
    const quality = gradeQuality(fixture, turn);
    return {
      fixture: fixture.id,
      model,
      pass: passed(checks),
      checks,
      qualityScore: quality.score,
      qualityMax: quality.max,
      quality: quality.items,
      text: turn.text,
      tools: turn.tools,
      usage: turn.usage,
      costUsd: caseCost(turn.usage, price),
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fixture: fixture.id,
      model,
      pass: false,
      checks: [],
      qualityScore: 0,
      qualityMax: 0,
      quality: [],
      text: "",
      tools: [],
      usage: {},
      costUsd: 0,
      latencyMs: Math.round(performance.now() - started),
      error: message,
    };
  }
};

const main = async (): Promise<void> => {
  const config = loadEvalConfig();
  const fixtures = await loadFixtures(join(here, "fixtures"), argValue("--fixture"), argValue("--tag"));
  const models = modelsFromArgs();
  const concurrency = concurrencyFromArgs();
  const prices = await loadModelPrices(models);
  const agent = new GrafanaAgent(config);
  const jobs = models.flatMap((model) => fixtures.map((fixture) => ({ model, fixture })));

  process.stderr.write(
    `${jobs.length} cases, concurrency ${Math.min(concurrency, jobs.length)}\n`,
  );

  const cases = await mapPool(jobs, concurrency, async (job, index) => {
    process.stderr.write(`${job.model} × ${job.fixture.id}\n`);
    return runCase(agent, job.fixture, job.model, -1 - index, prices[job.model]);
  });

  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const outDir = argValue("--out") ?? join(here, "results");
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, `${stamp}.json`);
  const mdPath = join(outDir, `${stamp}.md`);
  await Bun.write(jsonPath, JSON.stringify({ models, cases }, null, 2));
  const report = renderReport(cases);
  await Bun.write(mdPath, report);
  console.log(report);
  console.log(`\nwrote ${jsonPath}`);

  if (cases.some((c) => !c.pass)) {
    process.exitCode = 1;
  }
};

await main();
