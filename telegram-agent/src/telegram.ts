import { SpanStatusCode } from "@opentelemetry/api";
import { Bot, type Context } from "grammy";
import type { GrafanaAgent } from "./agent.ts";
import type { Config } from "./config.ts";
import { messageCounter, tracer } from "./otel.ts";

const TELEGRAM_LIMIT = 4000;

export const splitTelegramText = (text: string): string[] => {
  if (text.length <= TELEGRAM_LIMIT) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_LIMIT) {
    const window = remaining.slice(0, TELEGRAM_LIMIT);
    const breakAt = window.lastIndexOf("\n");
    const cut = breakAt > 500 ? breakAt : TELEGRAM_LIMIT;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
};

const keepTyping = (ctx: Context, signal: AbortSignal): void => {
  const tick = async () => {
    if (signal.aborted) {
      return;
    }
    try {
      await ctx.replyWithChatAction("typing");
    } catch {
      // chat action is best-effort
    }
  };
  void tick();
  const id = setInterval(() => {
    void tick();
  }, 4000);
  signal.addEventListener("abort", () => clearInterval(id), { once: true });
};

export const startTelegram = (config: Config, agent: GrafanaAgent): Bot => {
  const bot = new Bot(config.telegramBotToken);
  const busy = new Set<number>();

  const allowed = (chatId: number): boolean => config.allowedChatIds.has(chatId);

  bot.command("whoami", async (ctx) => {
    await ctx.reply(`chat id: ${ctx.chat.id}`);
  });

  bot.command("start", async (ctx) => {
    if (!allowed(ctx.chat.id)) {
      await ctx.reply(`Not allowlisted. Your chat id is ${ctx.chat.id}.`);
      return;
    }
    await ctx.reply(
      "Ask about Linux hosts or Proxmox. Example: what's the state of my linux servers",
    );
  });

  bot.command("reset", async (ctx) => {
    if (!allowed(ctx.chat.id)) {
      return;
    }
    agent.reset(ctx.chat.id);
    await ctx.reply("Conversation cleared.");
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return;
    }
    if (!allowed(ctx.chat.id)) {
      return;
    }
    if (busy.has(ctx.chat.id)) {
      await ctx.reply("Still working on the last question.");
      return;
    }

    busy.add(ctx.chat.id);
    const typing = new AbortController();
    keepTyping(ctx, typing.signal);

    await tracer.startActiveSpan(
      "telegram.handle_message",
      {
        attributes: {
          "telegram.chat.id": String(ctx.chat.id),
        },
      },
      async (span) => {
        try {
          const reply = await agent.ask(ctx.chat.id, ctx.message.text);
          for (const chunk of splitTelegramText(reply)) {
            await ctx.reply(chunk);
          }
          messageCounter.add(1, { outcome: "success" });
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          messageCounter.add(1, { outcome: "error" });
          const message = error instanceof Error ? error.message : "unknown error";
          span.recordException(error instanceof Error ? error : new Error(message));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          await ctx.reply(`Agent failed: ${message}`);
        } finally {
          typing.abort();
          busy.delete(ctx.chat.id);
          span.end();
        }
      },
    );
  });

  return bot;
};
