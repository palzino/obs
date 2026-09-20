import { GrafanaAgent, type AgentTurn } from "../src/agent.ts";
import { DEFAULT_OPENROUTER_MODEL, loadEvalConfig } from "../src/config.ts";
import { SYSTEM_PROMPT } from "../src/prompt.ts";

const QUESTIONS = [
  "what's the overall system health",
  "how's the status of my linux hosts",
  "are zinohub, webhook broker and zino-downloader up",
  "how many api requests been made per min",
  "how many nginx requests in the last 24 hours",
  "do we have any concerning error logs",
  "any bad traces we need to look at",
  "how many webhook broker jobs completed in the last 24h",
  "how's database-vm memory",
  "which service handles the most traffic in past 7 days",
];

const summarizeTools = (tools: AgentTurn["tools"]): string[] =>
  tools.map((tool) => {
    const expr =
      typeof tool.input.expr === "string"
        ? tool.input.expr
        : typeof tool.input.logql === "string"
          ? tool.input.logql
          : typeof tool.input.query === "string"
            ? tool.input.query
            : "";
    return `${tool.name}${expr ? ` ${expr}` : ""}`;
  });

const grafanaMcpUrl = process.env.GRAFANA_MCP_URL?.trim();
if (!grafanaMcpUrl) {
  throw new Error("GRAFANA_MCP_URL is required");
}

const config = loadEvalConfig();
const agent = new GrafanaAgent({
  ...config,
  grafanaMcpUrl,
  openRouterFallbacks: [],
});

await agent.connect();
const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
console.log(`prompt_chars=${SYSTEM_PROMPT.length} model=${model} n=${QUESTIONS.length}`);

let totalCost = 0;
let totalIn = 0;
let totalOut = 0;
let totalMs = 0;
let totalTools = 0;

try {
  for (const [index, question] of QUESTIONS.entries()) {
    const started = performance.now();
    const turn = await agent.run({
      chatId: 9100 + index,
      text: question,
      model,
    });
    const ms = Math.round(performance.now() - started);
    const cost = turn.usage.cost ?? 0;
    totalCost += cost;
    totalIn += turn.usage.inputTokens ?? 0;
    totalOut += turn.usage.outputTokens ?? 0;
    totalMs += ms;
    totalTools += turn.tools.length;
    console.log(`\n===== Q${index + 1}: ${question} =====`);
    console.log(
      `${ms}ms tools=${turn.tools.length} in=${turn.usage.inputTokens ?? 0} out=${turn.usage.outputTokens ?? 0} cost=$${cost.toFixed(4)}`,
    );
    console.log(summarizeTools(turn.tools).join("\n") || "(no tools)");
    console.log("---");
    console.log(turn.text);
  }
} finally {
  await agent.close();
}

console.log(
  `\n===== TOTAL =====\n$${totalCost.toFixed(4)} in=${totalIn} out=${totalOut} avg_ms=${Math.round(totalMs / QUESTIONS.length)} avg_tools=${(totalTools / QUESTIONS.length).toFixed(1)} prompt_chars=${SYSTEM_PROMPT.length}`,
);
