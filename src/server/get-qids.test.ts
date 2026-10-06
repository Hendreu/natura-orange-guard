import { ok, strictEqual } from "node:assert";
import { test } from "node:test";
import type { QidRow } from "@/lib/sla-data";

const enabled = process.env["RUN_READONLY_QID_TEST"] === "1";

if (!enabled) {
  test(
    "getQids live regression requires RUN_READONLY_QID_TEST=1 and existing database",
    { skip: "Explicit opt-in required: tests SELECT live samples without writing fixtures." },
    () => {},
  );
} else {
  const { default: sql } = await import("@/lib/db");
  const { getQids } = await import("@/server/queries.server");
  const defaults = {
    sev: [],
    team: "Todas",
    q: "",
    tags: [],
    categories: [],
    statuses: ["Active", "New", "Re-Opened"],
    yearScope: "current",
  };
  const samples = [92468, 388660, 92469];
  type Metadata = {
    readonly qid: string;
    readonly title: string | null;
    readonly category: string | null;
    readonly solution: string | null;
  };
  type ViewRow = Omit<QidRow, "title" | "solution" | "action" | "status"> & {
    readonly title: string | null;
    readonly solution: string | null;
    readonly action: string | null;
    readonly status: string | null;
  };

  async function currentMetadata(qid: number): Promise<Metadata> {
    const rows = await sql<Metadata[]>`
      SELECT "QID" AS qid, "Title" AS title, "Category" AS category, "Solution" AS solution
      FROM "KnowledgeBase" WHERE "QID" = ${String(qid)}
    `;
    const row = rows[0];
    ok(rows.length === 1 && row, `QID ${qid}: requires unique current-source fixture`);
    ok(row.title?.trim() && row.solution?.trim() && row.category?.trim(), "Complete fixture");
    return row;
  }

  function sameMetrics(actual: QidRow, expected: ViewRow): boolean {
    const keys = ["qid", "sev", "team", "count", "corr", "naoCorr", "age"] as const;
    return (
      keys.every((key) => actual[key] === expected[key]) &&
      actual.status === (expected.status ?? "")
    );
  }

  function sameMetadata(actual: QidRow, expected: Metadata): boolean {
    return (
      actual.title === expected.title &&
      actual.solution === expected.solution &&
      actual.action === expected.category
    );
  }

  async function byQid(qid: number) {
    return (await getQids({ ...defaults, q: String(qid) })).filter((row) => row.qid === qid);
  }

  async function expectedCounts(qid: number) {
    const [expected] = await sql<{ count: number; corr: number; naoCorr: number }[]>`
      SELECT count(*)::int AS count,
        count(*) FILTER (WHERE kb.solution IS NOT NULL)::int AS corr,
        count(*) FILTER (WHERE kb.solution IS NULL)::int AS "naoCorr"
      FROM vulnerabilities v
      JOIN (SELECT DISTINCT "QG_HostID" FROM "All_Assets") a
        ON a."QG_HostID" = v."QG_HostID"
      LEFT JOIN kb_summary kb ON kb.qid = v."QID"
      WHERE v."QID" = ${String(qid)} AND v."Severity"::int BETWEEN 1 AND 5
        AND v."Status" IN ('Active', 'New', 'Re-Opened')
        AND v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())
    `;
    ok(expected && expected.count > 0, "Eligible sample must exist");
    return expected;
  }

  for (const qid of samples) {
    test(`recovers live metadata when QID ${qid} is absent from summary`, async () => {
      const expected = await currentMetadata(qid);
      const summary = await sql`SELECT qid FROM kb_summary WHERE qid = ${String(qid)}`;
      strictEqual(summary.length, 0, "Known missing-summary fixture changed");

      const rows = await byQid(qid);

      ok(rows.length > 0, `QID ${qid}: eligible fixture must be returned`);
      const evidence = {
        qid,
        groups: rows.length,
        detections: rows.reduce((sum, row) => sum + row.count, 0),
        titleLength: rows[0]?.title.length,
        solutionLength: rows[0]?.solution.length,
      };
      console.info(JSON.stringify(evidence));
      ok(
        rows.every((row) => sameMetadata(row, expected)),
        `QID ${qid}: metadata recovery`,
      );
    });

    test(`preserves eligible detection and summary correction counts for QID ${qid}`, async () => {
      const expected = await expectedCounts(qid);

      const rows = await byQid(qid);

      for (const key of ["count", "corr", "naoCorr"] as const) {
        strictEqual(
          rows.reduce((sum, row) => sum + row[key], 0),
          expected[key],
        );
      }
    });

    for (const search of ["title", "category-filter", "category-search"] as const) {
      test(`finds QID ${qid} by recovered ${search} before LIMIT`, async () => {
        const metadata = await currentMetadata(qid);
        const baseline = await byQid(qid);
        ok(baseline.length > 0, "QID search must return the sample");
        const filters =
          search === "title"
            ? { q: metadata.title ?? "" }
            : search === "category-filter"
              ? { q: String(qid), categories: [metadata.category ?? ""] }
              : { q: metadata.category ?? "" };

        const rows = (await getQids({ ...defaults, ...filters })).filter((row) => row.qid === qid);

        ok(rows.length > 0, `QID ${qid}: recovered search must include the sample`);
        const unchanged = rows.every((row) =>
          baseline.some((original) => sameMetrics(row, original)),
        );
        ok(unchanged, `QID ${qid}: search must preserve visible group metrics`);
        if (search !== "category-search") strictEqual(rows.length, baseline.length);
        else strictEqual(rows[0]?.count, baseline[0]?.count);
      });
    }
  }

  test("recovers default live metadata while preserving nonblank summary values", async () => {
    const expected = await Promise.all(samples.map(currentMetadata));

    const rows = await getQids(defaults);

    strictEqual(rows.length, 120);
    const blankTitles = rows.filter((row) => !row.title.trim()).length;
    console.info(JSON.stringify({ defaultRows: rows.length, blankTitles }));
    for (const metadata of expected) {
      const matching = rows.filter((row) => String(row.qid) === metadata.qid);
      ok(matching.length > 0, "Default sample must remain visible");
      ok(
        matching.every((row) => sameMetadata(row, metadata)),
        "Default metadata recovery",
      );
    }
    const summary = await sql<Metadata[]>`
      SELECT qid, title, category, solution FROM kb_summary
      WHERE qid = ANY(${rows.map((row) => String(row.qid))})
    `;
    ok(summary.length > 0, "Requires existing summary rows");
    for (const metadata of summary) {
      const matching = rows.filter((row) => String(row.qid) === metadata.qid);
      for (const key of ["title", "solution", "category"] as const) {
        const field = key === "category" ? "action" : key;
        if (metadata[key]?.trim()) ok(matching.every((row) => row[field] === metadata[key]));
      }
    }
  });

  test("recovers history-only QID 5009919 without multiplying duplicate source rows", async () => {
    const qid = 5009919;
    const expected = await sql<Metadata[]>`
      SELECT "QID" AS qid, "Title" AS title, "Category" AS category, "Solution" AS solution
      FROM "KnowledgeBase_old" WHERE "QID" = ${String(qid)}
      ORDER BY imported_at DESC NULLS LAST,
        "Last_Service_Modification_Date" COLLATE "C" DESC NULLS LAST,
        "Title" COLLATE "C" DESC NULLS LAST, "Category" COLLATE "C" DESC NULLS LAST,
        "Solution" COLLATE "C" DESC NULLS LAST
    `;
    const metadata = expected[0];
    ok(expected.length > 1 && metadata, "Requires the duplicated historical fixture");
    const higherPriority = await sql`
      SELECT qid FROM kb_summary WHERE qid = ${String(qid)}
      UNION ALL SELECT "QID" FROM "KnowledgeBase" WHERE "QID" = ${String(qid)}
    `;
    strictEqual(higherPriority.length, 0, "Requires a history-only sample");
    const counts = await expectedCounts(qid);

    const rows = await byQid(qid);

    ok(rows.length > 0, "Historical sample must remain visible");
    ok(
      rows.every((row) => sameMetadata(row, metadata)),
      "Historical metadata recovery",
    );
    for (const key of ["count", "corr", "naoCorr"] as const) {
      strictEqual(
        rows.reduce((sum, row) => sum + row[key], 0),
        counts[key],
      );
    }
    console.info(
      JSON.stringify({ historyQid: qid, sourceRows: expected.length, count: counts.count }),
    );
  });

  for (const yearScope of ["current", "all"]) {
    test(`preserves ${yearScope} view membership, order, metrics and existing metadata`, async () => {
      const view = yearScope === "current" ? "mv_top_qids_current_year" : "mv_top_qids";
      const stored = await sql<ViewRow[]>`SELECT * FROM ${sql(view)}`;
      ok(stored.length > 0, "View fixture must be populated");

      const rows = await getQids({ yearScope });

      strictEqual(rows.length, stored.length);
      for (const [index, row] of rows.entries()) {
        const original = stored[index];
        ok(original && sameMetrics(row, original), "Stored view membership/order/metrics");
        for (const key of ["title", "solution", "action"] as const) {
          if (key === "action" && original.action === "Unknown") continue;
          if (original[key]?.trim()) strictEqual(row[key] === original[key], true);
        }
      }
    });

    test(`recovers current-source metadata for missing ${yearScope} view rows`, async (context) => {
      const view = yearScope === "current" ? "mv_top_qids_current_year" : "mv_top_qids";
      const expected = await sql<Metadata[]>`
        SELECT DISTINCT kb."QID" AS qid, kb."Title" AS title,
          kb."Category" AS category, kb."Solution" AS solution
        FROM ${sql(view)} mv JOIN "KnowledgeBase" kb ON kb."QID" = mv.qid::text
        WHERE (mv.title IS NULL OR mv.title !~ '[^[:space:]]')
          AND kb."Title" ~ '[^[:space:]]'
          AND NOT EXISTS (SELECT 1 FROM kb_summary summary WHERE summary.qid = kb."QID")
      `;
      if (expected.length === 0) {
        context.skip("No current-only recoverable blank-title row in this stored view snapshot");
        return;
      }

      const rows = await getQids({ yearScope });

      for (const metadata of expected) {
        const matching = rows.filter((row) => String(row.qid) === metadata.qid);
        ok(matching.length > 0, "Recoverable view row must remain visible");
        ok(
          matching.every((row) => sameMetadata(row, metadata)),
          "View metadata recovery",
        );
      }
      const knownSamples = rows.filter((row) => samples.includes(row.qid)).map((row) => row.qid);
      console.info(
        JSON.stringify({ view: yearScope, recoveredQids: expected.length, knownSamples }),
      );
    });
  }
}
