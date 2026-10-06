import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

const enabled = process.env["RUN_READONLY_QID_TEST"] === "1";

if (!enabled) {
  test(
    "qid metadata historical recovery requires RUN_READONLY_QID_TEST=1",
    { skip: "Explicit opt-in required: read-only synthetic PostgreSQL SELECT." },
    () => {},
  );
} else {
  const { default: sql } = await import("@/lib/db");
  const { qidMetadataCtesSql } = await import("@/server/qid-metadata.server");
  type Metadata = {
    readonly qid: string;
    readonly title: string | null;
    readonly solution: string | null;
  };

  // Given: history-only candidates with an older complete row and a newer blank field.
  // When: execute the production CTE helper once against synthetic source CTEs.
  const rows = await sql<Metadata[]>`
    WITH qid_candidates(qid) AS (VALUES ('1001'::text), ('1002'::text)),
    kb_summary(qid, title, category, solution) AS (
      SELECT * FROM (VALUES (NULL::text, NULL::text, NULL::text, NULL::text))
        AS empty_summary WHERE false
    ),
    "KnowledgeBase"("QID", "Title", "Category", "Solution", imported_at) AS (
      SELECT * FROM (VALUES (NULL::text, NULL::text, NULL::text, NULL::text,
        NULL::timestamptz)) AS empty_current WHERE false
    ),
    "KnowledgeBase_old"("QID", "Title", "Category", "Solution", imported_at,
      "Last_Service_Modification_Date") AS (
      VALUES
        ('1001', 'Synthetic older title', 'Synthetic category', 'Synthetic solution',
          '2026-01-01'::timestamptz, '2026-01-01'),
        ('1001', '   ', 'Synthetic category', 'Synthetic solution',
          '2026-02-01'::timestamptz, '2026-02-01'),
        ('1002', 'Synthetic older title', 'Synthetic category', 'Synthetic solution',
          '2026-01-01'::timestamptz, '2026-01-01'),
        ('1002', 'Synthetic latest title', 'Synthetic category', '   ',
          '2026-02-01'::timestamptz, '2026-02-01')
    )
    ${qidMetadataCtesSql()}
    SELECT qid, title, solution FROM qid_metadata ORDER BY qid
  `;

  test("recovers older historical title when the newest title is whitespace", () => {
    // Then: the available title remains visible despite a newer blank title.
    deepStrictEqual(
      rows.filter((row) => row.qid === "1001"),
      [
        {
          qid: "1001",
          title: "Synthetic older title",
          solution: "Synthetic solution",
        },
      ],
    );
  });

  test("recovers older historical solution when the newest solution is whitespace", () => {
    // Then: recover the older solution while preserving the latest nonblank title.
    deepStrictEqual(
      rows.filter((row) => row.qid === "1002"),
      [
        {
          qid: "1002",
          title: "Synthetic latest title",
          solution: "Synthetic solution",
        },
      ],
    );
  });
}
