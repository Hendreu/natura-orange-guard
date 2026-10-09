import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import {
  formatQidSla,
  parseQidSlaSearch,
  qidSlaFilterFromSearch,
  qidSlaFilterSchema,
} from "./qid-sla";
import type { QidSla } from "./qid-sla";

for (const days of [1, 30, 2147483647]) {
  test(`parses next ${days} days from URL strings and numbers`, () => {
    const inputs = [String(days), days];
    const results = inputs.map((slaDays) =>
      qidSlaFilterFromSearch(parseQidSlaSearch({ sla: "next", slaDays })),
    );
    deepStrictEqual(
      results,
      inputs.map(() => ({ mode: "next", days })),
    );
  });
}
for (const slaDays of [
  undefined,
  null,
  "",
  " ",
  true,
  [],
  {},
  "no",
  "Infinity",
  Infinity,
  NaN,
  0,
  -1,
  1.5,
  2147483648,
]) {
  test(`omits invalid URL proximity ${String(slaDays)}`, () => {
    const search = { sla: "next", slaDays, team: "Cloud" };
    const result = parseQidSlaSearch(search);
    deepStrictEqual(result, {});
  });
}
for (const sla of ["within", "overdue", "due-today"] as const) {
  test(`projects ${sla} without stale days or unrelated URL keys`, () => {
    const search = { sla, slaDays: "7", team: "Cloud", q: "123" };
    const projected = parseQidSlaSearch(search);
    deepStrictEqual(projected, { sla });
    deepStrictEqual(qidSlaFilterFromSearch(projected), { mode: sla });
    deepStrictEqual(qidSlaFilterSchema.parse({ mode: sla }), { mode: sla });
    deepStrictEqual(
      { ...search, ...projected, slaDays: undefined },
      { sla, slaDays: undefined, team: "Cloud", q: "123" },
    );
  });
}
test("omits unsupported URL modes and never supplies default days", () => {
  const inputs = [{ sla: "all", slaDays: 7 }, { sla: "next" }, { slaDays: 7 }, {}];
  const results = inputs.map(parseQidSlaSearch);
  deepStrictEqual(results, [{}, {}, {}, {}]);
});
for (const input of [
  { mode: "all" },
  { mode: "next", days: "7" },
  { mode: "next", days: 0 },
  { mode: "next", days: Infinity },
  { mode: "next", days: 2147483648 },
  { mode: "next", days: 1.5 },
  { mode: "overdue", days: 7 },
  { mode: "within", days: 7 },
  { mode: "within", extra: true },
  { mode: "due-today", extra: true },
]) {
  test(`rejects invalid API SLA input ${JSON.stringify(input)}`, () => {
    const result = qidSlaFilterSchema.safeParse(input);
    strictEqual(result.success, false);
  });
}
for (const [state, remaining, expected] of [
  ["open", 1, "Faltam 1d"],
  ["open", 0, "Vence hoje"],
  ["open", -1, "-1d (vencido)"],
  ["open", -100, "-100d (vencido)"],
  ["fixed", null, "Corrigida"],
  ["not-applicable", null, "Não monitorada"],
  ["unknown", null, "SLA indisponível"],
] as const) {
  test(`formats ${state} countdown ${remaining}`, () => {
    const sla: QidSla = {
      state,
      daysRemaining: remaining,
      thresholdDays: 30,
      lastFoundDate: null,
      dueDate: null,
      asOfDate: "2026-01-01",
    };
    const result = formatQidSla(sla);
    strictEqual(result, expected);
  });
}
