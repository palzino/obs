import { expect, test } from "bun:test";
import { splitTelegramText } from "./telegram.ts";

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
