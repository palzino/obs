import { expect, test } from "bun:test";
import versionFile from "../version.json" with { type: "json" };
import { AGENT_VERSION, splitTelegramText, withVersionFooter } from "./telegram.ts";

test("keeps short replies as one chunk", () => {
  expect(splitTelegramText("all hosts up")).toEqual(["all hosts up"]);
});

test("splits long replies on a newline before the telegram limit", () => {
  const line = "x".repeat(80);
  const text = Array.from({ length: 60 }, () => line).join("\n");
  const chunks = splitTelegramText(text);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((chunk) => chunk.length <= 4000)).toBe(true);
});

test("loads the agent version from version.json", () => {
  expect(AGENT_VERSION).toBe(versionFile.version);
});

test("appends the version at the bottom of a reply", () => {
  expect(withVersionFooter("Finding: nginx most HTTP")).toBe(
    `Finding: nginx most HTTP\n\nv${versionFile.version}`,
  );
});
