import { GrafanaAgent } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { startTelegram } from "./telegram.ts";

const config = loadConfig();
const agent = new GrafanaAgent(config);
const bot = startTelegram(config, agent);
let ready = false;

const server = Bun.serve({
  port: config.healthPort,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ok: ready }, { status: ready ? 200 : 503 });
    }
    return new Response("not found", { status: 404 });
  },
});

const shutdown = async (signal: string) => {
  console.log(`shutting down on ${signal}`);
  await bot.stop();
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await agent.connect();
ready = true;
console.log(`grafana mcp connected at ${config.grafanaMcpUrl}`);
console.log(`health listening on :${server.port}`);

await bot.start({
  onStart: (info) => {
    console.log(`telegram polling as @${info.username}`);
  },
});

ready = false;
server.stop();
await agent.close();
