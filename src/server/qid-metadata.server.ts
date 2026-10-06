import sql from "@/lib/db";
import type { QidRow } from "@/lib/sla-data";

type QidMetadata = {
  readonly qid: string;
  readonly title: string | null;
  readonly category: string | null;
  readonly solution: string | null;
};

export function qidMetadataCtesSql() {
  return sql`, qid_summary AS MATERIALIZED (
    SELECT candidate.qid,
      CASE WHEN summary.title ~ '[^[:space:]]' THEN summary.title END AS title,
      CASE WHEN summary.category ~ '[^[:space:]]' THEN summary.category END AS category,
      CASE WHEN summary.solution ~ '[^[:space:]]' THEN summary.solution END AS solution,
      summary.solution IS NOT NULL AS has_summary_solution
    FROM qid_candidates candidate
    LEFT JOIN kb_summary summary ON summary.qid = candidate.qid
  ), qid_current_candidates AS MATERIALIZED (
    SELECT current_kb."QID" AS qid,
      CASE WHEN current_kb."Title" ~ '[^[:space:]]' THEN current_kb."Title" END AS title,
      CASE WHEN current_kb."Category" ~ '[^[:space:]]' THEN current_kb."Category" END AS category,
      CASE WHEN current_kb."Solution" ~ '[^[:space:]]' THEN current_kb."Solution" END AS solution,
      ROW_NUMBER() OVER (PARTITION BY current_kb."QID"
        ORDER BY current_kb.imported_at DESC NULLS LAST,
          current_kb."Title" COLLATE "C" DESC NULLS LAST,
          current_kb."Category" COLLATE "C" DESC NULLS LAST,
          current_kb."Solution" COLLATE "C" DESC NULLS LAST) AS source_order
    FROM "KnowledgeBase" current_kb
    JOIN qid_summary summary ON summary.qid = current_kb."QID"
    WHERE summary.title IS NULL OR summary.category IS NULL OR summary.solution IS NULL
  ), qid_current AS MATERIALIZED (
    SELECT qid,
      (array_agg(title ORDER BY source_order) FILTER (WHERE title IS NOT NULL))[1] AS title,
      (array_agg(category ORDER BY source_order) FILTER (WHERE category IS NOT NULL))[1] AS category,
      (array_agg(solution ORDER BY source_order) FILTER (WHERE solution IS NOT NULL))[1] AS solution
    FROM qid_current_candidates
    GROUP BY qid
  ), qid_primary AS MATERIALIZED (
    SELECT summary.qid,
      COALESCE(summary.title, current_kb.title) AS title,
      COALESCE(summary.category, current_kb.category) AS category,
      COALESCE(summary.solution, current_kb.solution) AS solution,
      summary.has_summary_solution
    FROM qid_summary summary
    LEFT JOIN qid_current current_kb ON current_kb.qid = summary.qid
  ), qid_history_candidates AS MATERIALIZED (
    SELECT history."QID" AS qid,
      CASE WHEN history."Title" ~ '[^[:space:]]' THEN history."Title" END AS title,
      CASE WHEN history."Category" ~ '[^[:space:]]' THEN history."Category" END AS category,
      CASE WHEN history."Solution" ~ '[^[:space:]]' THEN history."Solution" END AS solution,
      ROW_NUMBER() OVER (PARTITION BY history."QID"
        ORDER BY history.imported_at DESC NULLS LAST,
          history."Last_Service_Modification_Date" COLLATE "C" DESC NULLS LAST,
          history."Title" COLLATE "C" DESC NULLS LAST,
          history."Category" COLLATE "C" DESC NULLS LAST,
          history."Solution" COLLATE "C" DESC NULLS LAST) AS source_order
    FROM "KnowledgeBase_old" history
    JOIN qid_primary metadata ON metadata.qid = history."QID"
    WHERE metadata.title IS NULL OR metadata.category IS NULL OR metadata.solution IS NULL
  ), qid_history AS MATERIALIZED (
    SELECT qid,
      (array_agg(title ORDER BY source_order) FILTER (WHERE title IS NOT NULL))[1] AS title,
      (array_agg(category ORDER BY source_order) FILTER (WHERE category IS NOT NULL))[1] AS category,
      (array_agg(solution ORDER BY source_order) FILTER (WHERE solution IS NOT NULL))[1] AS solution
    FROM qid_history_candidates
    GROUP BY qid
  ), qid_metadata AS MATERIALIZED (
    SELECT metadata.qid,
      COALESCE(metadata.title, history.title) AS title,
      COALESCE(metadata.category, history.category) AS category,
      COALESCE(metadata.solution, history.solution) AS solution,
      metadata.has_summary_solution
    FROM qid_primary metadata
    LEFT JOIN qid_history history ON history.qid = metadata.qid
  )`;
}

export async function enrichQidRows(rows: QidRow[]): Promise<QidRow[]> {
  const qids = [
    ...new Set(
      rows
        .filter(
          (row) =>
            !row.title.trim() ||
            !row.solution.trim() ||
            !row.action.trim() ||
            row.action === "Unknown",
        )
        .map((row) => String(row.qid)),
    ),
  ];
  if (qids.length === 0) return rows;
  const metadata = await sql<QidMetadata[]>`
    WITH qid_candidates AS MATERIALIZED (SELECT unnest(${qids}::text[]) AS qid)
    ${qidMetadataCtesSql()}
    SELECT qid, title, category, solution FROM qid_metadata
  `;
  const byQid = new Map(metadata.map((row) => [row.qid, row]));
  return rows.map((row) => {
    const recovered = byQid.get(String(row.qid));
    return {
      ...row,
      title: row.title.trim() ? row.title : (recovered?.title ?? ""),
      solution: row.solution.trim() ? row.solution : (recovered?.solution ?? ""),
      action:
        row.action.trim() && row.action !== "Unknown"
          ? row.action
          : (recovered?.category ?? "Unknown"),
    };
  });
}
