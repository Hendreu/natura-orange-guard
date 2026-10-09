import sql from "@/lib/db";
import { ACTIVE_STATUSES, SLA_THRESHOLDS } from "@/lib/constants";
import type { QidSla, QidSlaFilter } from "@/lib/qid-sla";
import type { QidRow } from "@/lib/sla-data";
import { qidMetadataCtesSql } from "@/server/qid-metadata.server";

type SqlFragment = ReturnType<typeof qidMetadataCtesSql>;

// Policy: UTC LastFound calendar anchor, 30/60/90 days; low is unmonitored.
export function qidSlaCtesSql(asOfDate = sql`(now() AT TIME ZONE 'UTC')::date`) {
  return sql`, sla_parts AS MATERIALIZED (
    SELECT qid, team, action, sev, status,
      CASE WHEN last_found ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|T|[[:space:]])'
        THEN substring(last_found, 1, 4)::int END AS year,
      CASE WHEN last_found ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|T|[[:space:]])'
        THEN substring(last_found, 6, 2)::int END AS month,
      CASE WHEN last_found ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|T|[[:space:]])'
        THEN substring(last_found, 9, 2)::int END AS day
    FROM sla_detections
  ), sla_calendar AS MATERIALIZED (
    SELECT qid, team, action, sev, status, month,
      CASE WHEN year BETWEEN 1 AND 9999 AND month BETWEEN 1 AND 12 AND day BETWEEN 1 AND 31
        THEN make_date(year, month, 1) + (day - 1) END AS candidate
    FROM sla_parts
  ), sla_anchors AS MATERIALIZED (
    SELECT qid, team, action, sev, status,
      CASE WHEN EXTRACT(MONTH FROM candidate) = month THEN candidate END AS anchor
    FROM sla_calendar
  ), sla_groups AS MATERIALIZED (
    SELECT qid, team, action, sev,
      CASE WHEN sev IN ('Crítica', 'Alta', 'Média')
        THEN (${sql.json(SLA_THRESHOLDS)}::jsonb ->> sev)::int END AS threshold,
      COUNT(*) FILTER (WHERE status IN ${sql([...ACTIVE_STATUSES])}) > 0 AS has_open,
      BOOL_OR(status IN ${sql([...ACTIVE_STATUSES])} AND anchor IS NULL) AS invalid_open,
      BOOL_AND(COALESCE(status = 'Fixed', false)) AS fixed_only,
      MIN(anchor) FILTER (WHERE status IN ${sql([...ACTIVE_STATUSES])}) AS last_found
    FROM sla_anchors GROUP BY qid, team, action, sev
  ), sla_states AS MATERIALIZED (
    SELECT qid, team, action, sev, threshold, last_found,
      CASE WHEN sev = 'Baixa' THEN 'not-applicable'
        WHEN threshold IS NULL OR invalid_open THEN 'unknown'
        WHEN has_open THEN 'open' WHEN fixed_only THEN 'fixed' ELSE 'unknown' END AS state
    FROM sla_groups
  ), qid_sla AS MATERIALIZED (
    SELECT qid, team, action, sev, jsonb_build_object(
      'state', state, 'thresholdDays', threshold,
      'lastFoundDate', CASE WHEN state = 'open' THEN to_char(last_found, 'YYYY-MM-DD') END,
      'dueDate', CASE WHEN state = 'open' THEN to_char(last_found + threshold, 'YYYY-MM-DD') END,
      'daysRemaining', CASE WHEN state = 'open' THEN last_found + threshold - ${asOfDate} END,
      'asOfDate', to_char(${asOfDate}, 'YYYY-MM-DD')
    ) AS sla FROM sla_states
  )`;
}

export function qidSlaPredicateSql(filter?: QidSlaFilter) {
  if (!filter) return sql``;
  const open = sql`AND sla->>'state' = 'open'`;
  switch (filter.mode) {
    case "within":
      return sql`${open} AND (sla->>'daysRemaining')::int >= 0`;
    case "overdue":
      return sql`${open} AND (sla->>'daysRemaining')::int < 0`;
    case "due-today":
      return sql`${open} AND (sla->>'daysRemaining')::int = 0`;
    case "next":
      return sql`${open} AND (sla->>'daysRemaining')::int BETWEEN 1 AND ${filter.days}`;
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export function qidSlaUnavailableSql(severity = sql`sev`) {
  return sql`jsonb_build_object(
    'state', CASE WHEN ${severity} = 'Baixa' THEN 'not-applicable' ELSE 'unknown' END,
    'thresholdDays', CASE WHEN ${severity} IN ('Crítica', 'Alta', 'Média')
      THEN (${sql.json(SLA_THRESHOLDS)}::jsonb ->> ${severity})::int END,
    'lastFoundDate', NULL, 'dueDate', NULL, 'daysRemaining', NULL,
    'asOfDate', to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'))`;
}

export async function enrichQidSlaRows(
  rows: QidRow[],
  scope: { readonly assets: SqlFragment; readonly year: SqlFragment },
): Promise<QidRow[]> {
  if (rows.length === 0) return rows;
  const qids = [...new Set(rows.map((row) => String(row.qid)))];
  const identities = rows.map((row, ordinal) => ({
    ordinal,
    qid: String(row.qid),
    team: row.team,
    action: row.action,
    sev: row.sev,
  }));
  const live = await sql<{ ordinal: number; sla: QidSla }[]>`
    ${scope.assets}
    , eligible_detections AS MATERIALIZED (
      SELECT v."QID", v."Severity", v."Status", v."Last_Found_Datetime", a.team
      FROM vulnerabilities v JOIN filtered_assets a ON a."QG_HostID" = v."QG_HostID"
      WHERE v."QID" = ANY(${qids}::text[]) AND v."Severity"::int IN (1,2,3,4,5)
        ${scope.year}
    ), qid_candidates AS MATERIALIZED (SELECT DISTINCT "QID" AS qid FROM eligible_detections)
    ${qidMetadataCtesSql()}
    , sla_detections AS MATERIALIZED (
      SELECT v."QID" AS qid, COALESCE(v.team, 'Unknown') AS team,
        COALESCE(kb.category, 'Unknown') AS action,
        CASE v."Severity"::int WHEN 5 THEN 'Crítica' WHEN 4 THEN 'Alta'
          WHEN 3 THEN 'Média' WHEN 2 THEN 'Média' ELSE 'Baixa' END AS sev,
        v."Status" AS status, v."Last_Found_Datetime" AS last_found
      FROM eligible_detections v LEFT JOIN qid_metadata kb ON kb.qid = v."QID"
    ) ${qidSlaCtesSql()}
    SELECT requested.ordinal, COALESCE(live.sla, ${qidSlaUnavailableSql(sql`requested.sev`)}) AS sla
    FROM jsonb_to_recordset(${sql.json(identities)}::jsonb)
      AS requested(ordinal int, qid text, team text, action text, sev text)
    LEFT JOIN qid_sla live ON live.qid = requested.qid AND live.team = requested.team
      AND live.action = requested.action AND live.sev = requested.sev
  `;
  const byOrdinal = new Map(live.map((row) => [row.ordinal, row.sla]));
  return rows.map((row, ordinal) => ({ ...row, sla: byOrdinal.get(ordinal) ?? row.sla }));
}
