import { expect, test } from "bun:test";
import { matchesWhen } from "./match.ts";

test("matches field includes and excludes", () => {
  expect(
    matchesWhen(
      { expr: 'up{job="prometheus.scrape.node_exporter"}' },
      {
        expr_includes: 'job="prometheus.scrape.node_exporter"',
        expr_excludes: ['job="node"', 'job="prometheus"'],
      },
    ),
  ).toBe(true);

  expect(
    matchesWhen(
      { expr: 'up{job="node"}' },
      { expr_includes: 'job="prometheus.scrape.node_exporter"' },
    ),
  ).toBe(false);
});

test("matches rate * 60 as a per-minute query", () => {
  expect(
    matchesWhen(
      { expr: "sum(rate(nginx_http_requests_total[5m])) * 60" },
      { expr_includes: "nginx_http_requests_total", expr_matches: String.raw`\*\s*60` },
    ),
  ).toBe(true);
  expect(
    matchesWhen(
      { expr: "sum(rate(nginx_http_requests_total[5m]))" },
      { expr_includes: "nginx_http_requests_total", expr_matches: String.raw`\*\s*60` },
    ),
  ).toBe(false);
});

test("matches exact fields", () => {
  expect(matchesWhen({ datasourceUid: "loki" }, { datasourceUid: "loki" })).toBe(true);
  expect(matchesWhen({ datasourceUid: "1" }, { datasourceUid: "loki" })).toBe(false);
});
