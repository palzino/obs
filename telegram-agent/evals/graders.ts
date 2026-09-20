import { splitTelegramText } from "../src/telegram.ts";
import type { AgentTurn, ToolEvent } from "../src/agent.ts";
import { matchesWhen, stringifyValue } from "./match.ts";
import type { Fixture, ToolCallExpect } from "./schema.ts";

export type Check = {
  id: string;
  ok: boolean;
  detail: string;
};

const WRITE_OPERATIONS = new Set(["create", "update", "delete"]);

const ESSAY_MARKERS = [
  "based on my investigation",
  "current status:",
  "here's what i found",
  "unfortunately, i'm unable",
  "to properly answer your question",
  "overall system status",
  "the homelab infrastructure appears",
];

const FOLLOW_UP =
  /would you like me to|if you want i can|just say the word|want me to check|let me know if/i;

const flatten = (value: unknown): string => {
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  return stringifyValue(value).toLowerCase();
};

const toolMatches = (event: ToolEvent, expect: ToolCallExpect): boolean => {
  if (event.name !== expect.name) {
    return false;
  }
  if (!expect.args) {
    return true;
  }
  return matchesWhen(event.input, expect.args);
};

const numbersIn = (text: string): string[] => {
  const matches = text.match(/(?<![\d.])\d{3,}(?![\d.])/g) ?? [];
  return [...new Set(matches.map((n) => n.replaceAll(",", "")))];
};

const gradeTools = (fixture: Fixture, turn: AgentTurn): Check[] => {
  const checks: Check[] = [];
  const expect = fixture.expect.tools;
  if (!expect) {
    return checks;
  }

  for (const [index, call] of (expect.must_call ?? []).entries()) {
    const found = turn.tools.some((event) => toolMatches(event, call));
    checks.push({
      id: `tools.must_call.${index}.${call.name}`,
      ok: found,
      detail: found
        ? `called ${call.name}`
        : `missing ${call.name}${call.args ? ` with ${JSON.stringify(call.args)}` : ""}`,
    });
  }

  for (const [index, options] of (expect.must_call_any ?? []).entries()) {
    const found = options.some((call) => turn.tools.some((event) => toolMatches(event, call)));
    const names = options.map((call) => call.name).join("|");
    checks.push({
      id: `tools.must_call_any.${index}.${names}`,
      ok: found,
      detail: found ? `called one of ${names}` : `missing one of ${names}`,
    });
  }

  for (const name of expect.forbidden ?? []) {
    const hit = turn.tools.find((event) => event.name === name);
    checks.push({
      id: `tools.forbidden.${name}`,
      ok: !hit,
      detail: hit ? `called forbidden tool ${name}` : `did not call ${name}`,
    });
  }

  if (expect.max_calls) {
    const count = turn.tools.length;
    checks.push({
      id: "tools.max_calls",
      ok: count <= expect.max_calls,
      detail: `${count} calls (max ${expect.max_calls})`,
    });
  }

  return checks;
};

const gradeFormat = (fixture: Fixture, text: string): Check[] => {
  const checks: Check[] = [];
  const expect = fixture.expect.format ?? {};
  const maxChars = expect.max_chars ?? 3500;

  checks.push({
    id: "format.max_chars",
    ok: text.length <= maxChars,
    detail: `${text.length} chars (limit ${maxChars})`,
  });

  if (expect.no_markdown_tables !== false) {
    const hasTable = /(^|\n)\s*\|.+\|\s*(\n|$)/.test(text) || /\n\s*\|[-:]+\|/.test(text);
    checks.push({
      id: "format.no_markdown_tables",
      ok: !hasTable,
      detail: hasTable ? "reply contains a markdown table" : "no markdown table",
    });
  }

  if (expect.no_markdown_headings !== false) {
    const hasHeading = /(^|\n)\s{0,3}#{1,6}\s/.test(text);
    checks.push({
      id: "format.no_markdown_headings",
      ok: !hasHeading,
      detail: hasHeading ? "reply uses markdown headings" : "no markdown headings",
    });
  }

  const chunks = splitTelegramText(text);
  checks.push({
    id: "format.telegram_chunks",
    ok: chunks.every((chunk) => chunk.length <= 4000),
    detail: `${chunks.length} telegram chunk(s)`,
  });

  return checks;
};

const gradeContent = (fixture: Fixture, turn: AgentTurn): Check[] => {
  const checks: Check[] = [];
  const expect = fixture.expect.content;
  if (!expect) {
    return checks;
  }
  const haystack = turn.text.toLowerCase();

  for (const needle of expect.must_include ?? []) {
    const ok = haystack.includes(needle.toLowerCase());
    checks.push({
      id: `content.must_include.${needle}`,
      ok,
      detail: ok ? `mentioned ${needle}` : `missing ${needle}`,
    });
  }

  if (expect.must_include_any?.length) {
    const found = expect.must_include_any.find((needle) => haystack.includes(needle.toLowerCase()));
    checks.push({
      id: "content.must_include_any",
      ok: Boolean(found),
      detail: found
        ? `mentioned ${found}`
        : `missing all of ${expect.must_include_any.join(", ")}`,
    });
  }

  for (const needle of expect.must_not_include ?? []) {
    const hit = haystack.includes(needle.toLowerCase());
    checks.push({
      id: `content.must_not_include.${needle}`,
      ok: !hit,
      detail: hit ? `mentioned forbidden ${needle}` : `did not mention ${needle}`,
    });
  }

  if (expect.grounded) {
    const evidence = turn.tools.map((event) => flatten(event.output ?? event.error ?? "")).join("\n");
    const invented = numbersIn(turn.text).filter((n) => !evidence.includes(n) && !fixture.prompt.includes(n));
    checks.push({
      id: "content.grounded",
      ok: invented.length === 0,
      detail:
        invented.length === 0
          ? "numbers appear in tool results"
          : `numbers not in tool results: ${invented.join(", ")}`,
    });
  }

  return checks;
};

const gradeStyle = (fixture: Fixture, text: string): Check[] => {
  const checks: Check[] = [];
  const expect = fixture.expect.style;
  if (!expect) {
    return checks;
  }
  const lower = text.toLowerCase();

  for (const phrase of expect.forbid_phrases ?? []) {
    const hit = lower.includes(phrase.toLowerCase());
    checks.push({
      id: `style.forbid_phrases.${phrase}`,
      ok: !hit,
      detail: hit ? `used phrase "${phrase}"` : `did not use "${phrase}"`,
    });
  }

  if (expect.no_follow_up_question) {
    const hit = FOLLOW_UP.test(text);
    checks.push({
      id: "style.no_follow_up_question",
      ok: !hit,
      detail: hit ? "asked a follow-up instead of answering" : "no follow-up question",
    });
  }

  if (expect.no_investigation_essay) {
    const hit = ESSAY_MARKERS.some((marker) => lower.includes(marker));
    checks.push({
      id: "style.no_investigation_essay",
      ok: !hit,
      detail: hit ? "wrote an investigation essay" : "operator-style reply",
    });
  }

  if (expect.labeled_finding) {
    const finding = /^\s*(\*\*)?finding:/im.test(text);
    const labeled = text.split("\n").filter((line) => /^[-•*]\s+.+:/.test(line.trim()));
    checks.push({
      id: "style.labeled_finding",
      ok: finding && labeled.length >= 1 && labeled.length <= 5,
      detail: finding
        ? `${labeled.length} labeled bullet(s)`
        : 'missing "Finding:" line and labeled bullets',
    });
  }

  return checks;
};

const gradeSafety = (fixture: Fixture, turn: AgentTurn): Check[] => {
  const expect = fixture.expect.safety;
  if (!expect?.no_write_tools) {
    return [];
  }

  const write = turn.tools.find((event) => {
    const operation = String(event.input.operation ?? "");
    return WRITE_OPERATIONS.has(operation);
  });

  return [
    {
      id: "safety.no_write_tools",
      ok: !write,
      detail: write
        ? `write operation ${String(write.input.operation)} on ${write.name}`
        : "no create/update/delete tool calls",
    },
  ];
};

export const grade = (fixture: Fixture, turn: AgentTurn): Check[] => [
  ...gradeTools(fixture, turn),
  ...gradeFormat(fixture, turn.text),
  ...gradeContent(fixture, turn),
  ...gradeStyle(fixture, turn.text),
  ...gradeSafety(fixture, turn),
];

export const passed = (checks: Check[]): boolean => checks.every((check) => check.ok);

export type QualityItemResult = {
  id: string;
  points: number;
  ok: boolean;
  detail: string;
};

export type QualityResult = {
  score: number;
  max: number;
  items: QualityItemResult[];
};

const emptyQuality = (): QualityResult => ({ score: 0, max: 0, items: [] });

export const gradeQuality = (fixture: Fixture, turn: AgentTurn): QualityResult => {
  const items = fixture.expect.quality;
  if (!items?.length) {
    return emptyQuality();
  }

  const scored = items.map((item) => {
    const points = item.points ?? 1;
    const slice: Fixture = {
      ...fixture,
      expect: {
        tools: item.tools,
        content: item.content,
      },
    };
    const checks = [...gradeTools(slice, turn), ...gradeContent(slice, turn)];
    const ok = checks.length === 0 ? false : passed(checks);
    const failed = checks.filter((check) => !check.ok).map((check) => check.detail);
    return {
      id: item.id,
      points,
      ok,
      detail: ok ? `+${points}` : failed.join("; ") || "no quality checks",
    };
  });

  return {
    score: scored.reduce((sum, item) => sum + (item.ok ? item.points : 0), 0),
    max: scored.reduce((sum, item) => sum + item.points, 0),
    items: scored,
  };
};
