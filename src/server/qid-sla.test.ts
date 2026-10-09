import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import type { QidSla, QidSlaFilter } from "@/lib/qid-sla";

const enabled = process.env["RUN_READONLY_QID_TEST"] === "1";
if (!enabled) {
  test(
    "QID SLA requires explicit read-only PostgreSQL opt-in",
    { skip: "RUN_READONLY_QID_TEST=1" },
    () => {},
  );
} else {
  const { default: sql } = await import("@/lib/db");
  const { qidSlaCtesSql, qidSlaPredicateSql, qidSlaUnavailableSql } =
    await import("@/server/qid-sla.server");
  type Result = {
    readonly qid: string;
    readonly team: string;
    readonly action: string;
    readonly sev: string;
    readonly sla: QidSla;
  };
  async function calculate(
    lastFound: string | null,
    sev = "Crítica",
    options: { readonly status?: string; readonly asOfDate?: string } = {},
  ) {
    const { status = "Active", asOfDate = "2026-01-01" } = options;
    const rows = await sql<Result[]>`
      WITH sla_detections(qid, team, action, sev, status, last_found) AS (
        VALUES ('1'::text, 'Cloud'::text, 'Patch'::text, ${sev}::text, ${status}::text, ${lastFound}::text)
      ) ${qidSlaCtesSql(sql`${asOfDate}::date`)}
      SELECT qid, team, action, sev, sla FROM qid_sla
    `;
    return rows[0]?.sla;
  }
  for (const [sev, lastFound, dueDate, thresholdDays] of [
    ["Crítica", "2025-12-02", "2026-01-01", 30],
    ["Alta", "2025-11-02", "2026-01-01", 60],
    ["Média", "2025-10-03", "2026-01-01", 90],
  ] as const) {
    for (const [asOfDate, remaining] of [
      ["2025-12-31", 1],
      ["2026-01-01", 0],
      ["2026-01-02", -1],
    ] as const) {
      test(`${sev} uses the confirmed threshold boundary with ${remaining} days remaining`, async () => {
        const rows = await sql<{ sla: QidSla; within: boolean; outside: boolean }[]>`
          WITH sla_detections(qid, team, action, sev, status, last_found) AS (
            VALUES ('1', 'Cloud', 'Patch', ${sev}::text, 'Active', ${lastFound ?? null}::text)
          ) ${qidSlaCtesSql(sql`${asOfDate}::date`)}
          SELECT sla,
            EXISTS (SELECT 1 FROM qid_sla WHERE TRUE ${qidSlaPredicateSql({ mode: "within" })}) AS within,
            EXISTS (SELECT 1 FROM qid_sla WHERE TRUE ${qidSlaPredicateSql({ mode: "overdue" })}) AS outside
          FROM qid_sla
        `;
        const sla = rows[0]?.sla;
        strictEqual(sla?.thresholdDays, thresholdDays);
        strictEqual(sla?.dueDate, dueDate);
        strictEqual(sla?.daysRemaining, remaining);
        strictEqual(rows[0]?.within, remaining >= 0);
        strictEqual(rows[0]?.outside, remaining < 0);
      });
    }
  }
  for (const [lastFound, sev, remaining] of [
    ["2025-12-03", "Crítica", 1],
    ["2025-12-02", "Crítica", 0],
    ["2025-12-01", "Crítica", -1],
    ["2025-11-02", "Crítica", -30],
    ["2025-12-01", "Alta", 29],
    ["2025-12-01", "Média", 59],
  ] as const) {
    test(`returns signed remaining ${remaining} for ${sev}`, async () => {
      const sla = await calculate(lastFound, sev);
      strictEqual(sla?.daysRemaining, remaining);
    });
  }
  test("reopened detections use the current LastFound ISO UTC calendar anchor", async () => {
    const sla = await calculate("2025-12-01T23:59:59-03:00", "Crítica", { status: "Re-Opened" });
    deepStrictEqual([sla?.lastFoundDate, sla?.daysRemaining], ["2025-12-01", -1]);
  });
  for (const status of ["Active", "Re-Opened"]) {
    test(`${status} uses LastFound when FirstFound is older`, async () => {
      const rows = await sql<Result[]>`
        WITH sla_detections(qid, team, action, sev, status, first_found, last_found) AS (
          VALUES ('1'::text, 'Cloud'::text, 'Patch'::text, 'Crítica'::text,
            ${status}::text, '2020-01-01'::text, '2025-12-03'::text)
        ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
        SELECT qid, team, action, sev, sla FROM qid_sla
      `;
      const sla = rows[0]?.sla;
      deepStrictEqual(
        [sla?.state, sla?.lastFoundDate, sla?.dueDate, sla?.daysRemaining],
        ["open", "2025-12-03", "2026-01-02", 1],
      );
    });
  }
  test("later LastFound moves the reopened deadline and remaining days with identical FirstFound", async () => {
    const rows = await sql<Result[]>`
      WITH sla_detections(qid, team, action, sev, status, first_found, last_found) AS (VALUES
        ('earlier', 'Cloud', 'Patch', 'Crítica', 'Re-Opened', '2020-01-01', '2025-12-01'),
        ('later', 'Cloud', 'Patch', 'Crítica', 'Re-Opened', '2020-01-01', '2025-12-03')
      ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
      SELECT qid, team, action, sev, sla FROM qid_sla ORDER BY qid
    `;
    deepStrictEqual(
      rows.map((row) => [row.qid, row.sla.lastFoundDate, row.sla.dueDate, row.sla.daysRemaining]),
      [
        ["earlier", "2025-12-01", "2025-12-31", -1],
        ["later", "2025-12-03", "2026-01-02", 1],
      ],
    );
  });
  test("fixed-only groups do not tick even with an older deadline", async () => {
    const sla = await calculate("2020-01-01", "Alta", { status: "Fixed" });
    deepStrictEqual(
      [sla?.state, sla?.lastFoundDate, sla?.dueDate, sla?.daysRemaining],
      ["fixed", null, null, null],
    );
  });
  test("low groups are not monitored", async () => {
    const sla = await calculate(null, "Baixa");
    deepStrictEqual(
      [sla?.state, sla?.thresholdDays, sla?.lastFoundDate, sla?.dueDate, sla?.daysRemaining],
      ["not-applicable", null, null, null, null],
    );
  });
  for (const anchor of [
    null,
    "",
    "   ",
    "2025-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "0000-01-01",
    "junk",
  ]) {
    test(`invalid open anchor ${String(anchor)} makes the group unknown`, async () => {
      const sla = await calculate(anchor);
      deepStrictEqual([sla?.state, sla?.daysRemaining], ["unknown", null]);
    });
  }
  test("valid leap day crosses into March", async () => {
    const sla = await calculate("2024-02-29", "Crítica", { status: "New", asOfDate: "2024-03-30" });
    deepStrictEqual([sla?.dueDate, sla?.daysRemaining], ["2024-03-30", 0]);
  });
  test("unknown-only status is not fixed", async () => {
    const sla = await calculate("2025-11-02", "Alta", { status: "Ignored" });
    strictEqual(sla?.state, "unknown");
  });
  test("missing exact live identity returns unknown or unmonitored without copying a sibling deadline", async () => {
    const rows = await sql<Result[]>`
      WITH sla_detections(qid, team, action, sev, status, last_found) AS (
        VALUES ('1', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-03')
      ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
      SELECT requested.qid, requested.team, requested.action, requested.sev,
        COALESCE(live.sla, ${qidSlaUnavailableSql(sql`requested.sev`)}) AS sla
      FROM (VALUES ('1', 'Unix', 'Patch', 'Crítica'), ('1', 'Cloud', 'Patch', 'Baixa'))
        requested(qid, team, action, sev)
      LEFT JOIN qid_sla live USING (qid, team, action, sev)
      ORDER BY requested.sev
    `;
    deepStrictEqual(
      rows.map((row) => [row.sla.state, row.sla.daysRemaining]),
      [
        ["not-applicable", null],
        ["unknown", null],
      ],
    );
  });
  test("aggregates worst open deadlines independently for each exact group identity", async () => {
    const rows = await sql<Result[]>`
      WITH sla_detections(qid, team, action, sev, status, last_found) AS (VALUES
        ('1', 'Cloud', 'Patch', 'Crítica', 'Fixed', '2020-01-01'),
        ('1', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-03'),
        ('1', 'Cloud', 'Patch', 'Crítica', 'New', '2025-12-01'),
        ('1', 'Unix', 'Patch', 'Crítica', 'Active', '2025-12-03'),
        ('1', 'Cloud', 'Config', 'Crítica', 'Active', '2025-12-04'),
        ('1', 'Cloud', 'Patch', 'Alta', 'Active', '2025-11-18'),
        ('2', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-03'),
        ('2', 'Cloud', 'Patch', 'Crítica', 'New', NULL)
      ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
      SELECT qid, team, action, sev, sla FROM qid_sla ORDER BY qid, team, action, sev
    `;
    deepStrictEqual(
      rows.map((row) => [
        row.qid,
        row.team,
        row.action,
        row.sev,
        row.sla.state,
        row.sla.daysRemaining,
      ]),
      [
        ["1", "Cloud", "Config", "Crítica", "open", 2],
        ["1", "Cloud", "Patch", "Alta", "open", 16],
        ["1", "Cloud", "Patch", "Crítica", "open", -1],
        ["1", "Unix", "Patch", "Crítica", "open", 1],
        ["2", "Cloud", "Patch", "Crítica", "unknown", null],
      ],
    );
  });
  for (const [filter, expected] of [
    [{ mode: "next", days: 7 }, ["1", "7"]],
    [{ mode: "due-today" }, ["0"]],
    [{ mode: "overdue" }, ["-1"]],
    [{ mode: "within" }, ["0", "1", "7", "8", "high", "medium"]],
  ] satisfies readonly (readonly [QidSlaFilter, readonly string[]])[]) {
    test(`filters open groups by ${filter.mode} endpoints before LIMIT`, async () => {
      const rows = await sql<{ qid: string }[]>`
        WITH sla_detections(qid, team, action, sev, status, last_found) AS (VALUES
          ('-1', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-01'),
          ('0', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-02'),
          ('1', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-03'),
          ('7', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-09'),
          ('8', 'Cloud', 'Patch', 'Crítica', 'Active', '2025-12-10'),
          ('fixed', 'Cloud', 'Patch', 'Crítica', 'Fixed', '2025-12-01'),
          ('fixed-future', 'Cloud', 'Patch', 'Alta', 'Fixed', '2025-12-01'),
          ('low', 'Cloud', 'Patch', 'Baixa', 'Active', '2025-12-01'),
          ('unknown', 'Cloud', 'Patch', 'Crítica', 'Active', NULL),
          ('high', 'Cloud', 'Patch', 'Alta', 'Active', '2025-12-01'),
          ('medium', 'Cloud', 'Patch', 'Média', 'Active', '2025-12-01')
        ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
        SELECT qid FROM qid_sla WHERE TRUE ${qidSlaPredicateSql(filter)} ORDER BY qid LIMIT 120
      `;
      deepStrictEqual(
        rows.map((row) => row.qid),
        expected,
      );
    });
  }
  test("keeps qualifying groups beyond the unfiltered top 120", async () => {
    const rows = await sql<{ qid: string }[]>`
      WITH sla_detections(qid, team, action, sev, status, last_found) AS (
        SELECT number::text, 'Cloud', 'Patch', 'Crítica', 'Active',
          CASE WHEN number = 121 THEN '2025-12-03' ELSE '2025-12-01' END
        FROM generate_series(1, 121) number
      ) ${qidSlaCtesSql(sql`'2026-01-01'::date`)}
      SELECT qid FROM qid_sla WHERE TRUE ${qidSlaPredicateSql({ mode: "next", days: 1 })}
      ORDER BY qid::int LIMIT 120
    `;
    deepStrictEqual(
      rows.map((row) => row.qid),
      ["121"],
    );
  });
}
