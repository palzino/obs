# telegram-agent

Experiment: Telegram → OpenRouter Agent SDK → Grafana MCP → Telegram.

Ask `what's the state of my linux servers` and it queries Prometheus (node exporter + Proxmox) through the in-stack `mcp-grafana` service.

## 1. Create the bot (2 min)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the token into `.env` as `TELEGRAM_BOT_TOKEN`
3. Message the bot, then run it once with any chat id and send `/whoami`, or use `@userinfobot`
4. Put that number in `TELEGRAM_ALLOWED_CHAT_IDS`

## 2. Env (root `.env`)

```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_IDS=123456789
TELEGRAM_AGENT_VERSION=:latest
```

Optional: `GRAFANA_MCP_URL` (default `http://mcp-grafana:8000/mcp`), `AGENT_MAX_STEPS` (default `8`), `AGENT_TIMEOUT_MS` (default `90000`).

## 3. Build and push the image (~3 min)

From `telegram-agent/`, with Docker already logged into Gitea:

```bash
make build
```

That is the same shape as go-ci: `buildx --platform linux/amd64` and `--push` to `gitea.palvir.dev/palzino/obs` (the existing obs package, not a new `obs-telegram-agent` repo — that 502s).

Local run without Docker:

```bash
cd telegram-agent
bun install
GRAFANA_MCP_URL=http://localhost:8000/mcp bun run dev
```

## 4. Deploy

Compose service `telegram-agent` joins the `monitoring` network and talks to `mcp-grafana:8000`. Push to `main` so zino-ci pulls the image, or on the host:

```bash
docker compose pull telegram-agent
docker compose up -d telegram-agent
```

Health: `http://localhost:8081/healthz`

## Commands

| Command | Who | What |
|---------|-----|------|
| `/whoami` | anyone | prints chat id |
| `/start` | allowlisted | short help |
| `/reset` | allowlisted | clears that chat's agent memory |
