import { deepStrictEqual } from "node:assert/strict";
import { test } from "node:test";
import type { QidSla } from "@/lib/qid-sla";
import type { QidRow } from "@/lib/sla-data";

const enabled = process.env["RUN_READONLY_QID_TEST"] === "1";

if (!enabled) {
  test(
    "QID SLA enrichment requires explicit read-only PostgreSQL opt-in",
    { skip: "RUN_READONLY_QID_TEST=1" },
    () => {},
  );
} else {
  const { default: sql } = await import("@/lib/db");
  const { enrichQidSlaRows, qidSlaUnavailableSql } = await import("@/server/qid-sla.server");

  test("enriches a matching QID identity with numeric SLA days while preserving metrics", async () => {
    const metrics = {
      qid: 123,
      title: "Synthetic critical patch",
      sev: "Crítica",
      team: "Cloud",
      action: "Patch",
      count: 17,
      corr: 5,
      naoCorr: 12,
      age: 42,
      solution: "Synthetic patch solution",
      status: "Active",
    } as const;
    const row: QidRow = {
      ...metrics,
      sla: {
        state: "unknown",
        thresholdDays: null,
        lastFoundDate: null,
        dueDate: null,
        daysRemaining: null,
        asOfDate: "2000-01-01",
      },
    };
    const assets = sql`
      WITH filtered_assets("QG_HostID", team) AS (VALUES ('host-123'::text, 'Cloud'::text)),
      vulnerabilities("QID", "QG_HostID", "Severity", "Status", "Last_Found_Datetime") AS (
        SELECT '123'::text, 'host-123'::text, '5'::text, 'Active'::text,
          to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
      ),
      kb_summary(qid, title, category, solution) AS (
        VALUES ('123'::text, 'Synthetic critical patch'::text, 'Patch'::text,
          'Synthetic patch solution'::text)
      ),
      "KnowledgeBase"("QID", "Title", "Category", "Solution", imported_at) AS (
        SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz WHERE false
      ),
      "KnowledgeBase_old"("QID", "Title", "Category", "Solution", imported_at,
        "Last_Service_Modification_Date") AS (
        SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz,
          NULL::text WHERE false
      )
    `;

    const enriched = await enrichQidSlaRows([row], { assets, year: sql`` });

    deepStrictEqual(
      enriched.map(({ sla }) => [sla.state, sla.thresholdDays, sla.daysRemaining]),
      [["open", 30, 30]],
    );
    deepStrictEqual(
      enriched.map(({ sla, ...preserved }) => ({ ...preserved, sla: sla.state })),
      [{ ...metrics, sla: "open" }],
    );
  });

  test("unavailable SLA retains numeric severity thresholds without inventing deadlines", async () => {
    const rows = await sql<{ readonly sev: string; readonly sla: QidSla }[]>`
      WITH severities(ordinal, sev) AS (VALUES
        (1, 'Crítica'::text), (2, 'Alta'::text), (3, 'Média'::text), (4, 'Baixa'::text)
      )
      SELECT sev, ${qidSlaUnavailableSql()} AS sla FROM severities ORDER BY ordinal
    `;

    deepStrictEqual(
      rows.map(({ sev, sla }) => [
        sev,
        sla.state,
        sla.thresholdDays,
        sla.lastFoundDate,
        sla.dueDate,
        sla.daysRemaining,
      ]),
      [
        ["Crítica", "unknown", 30, null, null, null],
        ["Alta", "unknown", 60, null, null, null],
        ["Média", "unknown", 90, null, null, null],
        ["Baixa", "not-applicable", null, null, null, null],
      ],
    );
  });
}
