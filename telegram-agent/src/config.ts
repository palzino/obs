const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env ${name}`);
  }
  return value;
};

const csvNumbers = (value: string): Set<number> => {
  const ids = new Set<number>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id)) {
      throw new Error(`TELEGRAM_ALLOWED_CHAT_IDS has invalid id: ${part}`);
    }
    ids.add(id);
  }
  if (ids.size === 0) {
    throw new Error("TELEGRAM_ALLOWED_CHAT_IDS must list at least one chat id");
  }
  return ids;
};

export type Config = {
  openRouterApiKey: string;
  openRouterModel: string;
  telegramBotToken: string;
  allowedChatIds: Set<number>;
  grafanaMcpUrl: string;
  healthPort: number;
  agentTimeoutMs: number;
  maxAgentSteps: number;
};

export const loadConfig = (): Config => ({
  openRouterApiKey: required("OPENROUTER_API_KEY"),
  openRouterModel: process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-4",
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  allowedChatIds: csvNumbers(required("TELEGRAM_ALLOWED_CHAT_IDS")),
  grafanaMcpUrl: process.env.GRAFANA_MCP_URL?.trim() || "http://mcp-grafana:8000/mcp",
  healthPort: Number(process.env.HEALTH_PORT || "8080"),
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS || "90000"),
  maxAgentSteps: Number(process.env.AGENT_MAX_STEPS || "8"),
});
