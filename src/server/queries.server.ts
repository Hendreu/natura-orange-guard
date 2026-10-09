import sql from "@/lib/db";
import { TEAM_NAMES, SEVERITY_ORDER, ACTIVE_STATUSES } from "@/lib/constants";
import { enrichQidRows, qidMetadataCtesSql } from "@/server/qid-metadata.server";
import { enrichQidSlaRows, qidSlaCtesSql, qidSlaPredicateSql, qidSlaUnavailableSql } from "@/server/qid-sla.server";
import type { QidSlaFilter } from "@/lib/qid-sla";
import type {
  Trend,
  ActionGroup,
  SeverityBlock,
  SlaBucket,
  TeamData,
  QidRow,
  QidAssetsInput,
  QidAssetsResponse,
  AssetRow,
} from "@/lib/sla-data";

function teamRegex(team: string) {
  return `(^|[|,])Times:${team}([|,]|$)`;
}

function extractTeamExpr() {
  return sql`COALESCE(a.team, 'Unknown')`;
}

function squadFilterSql(team: string | undefined) {
  if (!team || team === "Todas") return sql``;
  return sql`AND a.team = ${team}`;
}

function categoriesFilterSql(categories?: string[]) {
  if (!categories || categories.length === 0) return sql``;
  return sql`AND COALESCE(kb.category, 'Unknown') IN ${sql(categories)}`;
}

function statusesFilterSql(statuses?: string[]) {
  if (!statuses || statuses.length === 0) return sql``;
  return sql`AND v."Status" IN ${sql(statuses)}`;
}

function yearFilterSql(yearScope?: string) {
  if (yearScope === "slipped") {
    return sql`AND v."Last_Found_Datetime"::timestamp < date_trunc('year', now())`;
  }
  if (yearScope === "current" || yearScope === undefined) {
    return sql`AND v."Last_Found_Datetime"::timestamp >= date_trunc('year', now())`;
  }
  return sql``;
}

function assetTagFilterSql(tags: number[]) {
  if (tags.length === 0) return sql``;
  return sql`AND EXISTS (
    SELECT 1
    FROM asset_tags at
    WHERE at.asset_id = a."ID"
      AND at.tag_id = ANY(${tags})
    GROUP BY at.asset_id
    HAVING COUNT(DISTINCT at.tag_id) = ${tags.length}
  )`;
}

function assetCteSql(team: string | undefined, tags: number[], extraCols = sql``) {
  const teamFilter =
    !team || team === "Todas"
      ? sql``
      : team === "All Cloud"
        ? sql`AND EXISTS (SELECT 1 FROM mv_asset_cloud mac JOIN "All_Assets" a2 ON a2."ID" = mac.asset_id WHERE a2."QG_HostID" = a."QG_HostID" AND mac.is_cloud = true)`
        : team === "All On-Prem"
          ? sql`AND NOT EXISTS (SELECT 1 FROM mv_asset_cloud mac JOIN "All_Assets" a2 ON a2."ID" = mac.asset_id WHERE a2."QG_HostID" = a."QG_HostID" AND mac.is_cloud = true)`
          : sql`AND a.team = ${team}`;
  const tagClause = assetTagFilterSql(tags);
  return sql`WITH filtered_assets AS MATERIALIZED (SELECT DISTINCT ON (a."QG_HostID") a."QG_HostID", a.team, a.is_cloud ${extraCols} FROM "All_Assets" a WHERE TRUE ${teamFilter} ${tagClause})`;
}

function severityLabelExpr() {
  return sql`CASE v."Severity"::int WHEN 5 THEN 'Crítica' WHEN 4 THEN 'Alta' WHEN 3 THEN 'Média' WHEN 2 THEN 'Média' ELSE 'Baixa' END`;
}

function ageExpr() {
  return sql`ROUND(EXTRACT(EPOCH FROM (now() - v."Last_Found_Datetime"::timestamp)) / 86400)::int`;
}

function thresholdExpr() {
  return sql`CASE v."Severity"::int WHEN 5 THEN 15 WHEN 4 THEN 30 WHEN 3 THEN 90 WHEN 2 THEN 90 ELSE 180 END`;
}

function statusFilterSql() {
  return sql`TRUE`;
}

function teamViewKey(team: string | undefined): { team: string; scope: string } | undefined {
  if (!team || team === "Todas") return undefined;
  if (team === "All Cloud") return { team: "All Cloud", scope: "full-cloud" };
  if (team === "All On-Prem") return { team: "All On-Prem", scope: "full-on-premise" };
  return { team, scope: "full" };
}

function makeTrends(): Record<string, Trend> {
  return {
    vulns: { diff: 0, pct: 0 },
    qids: { diff: 0, pct: 0 },
    assets: { diff: 0, pct: 0 },
    qds: { diff: 0, pct: 0 },
    qds_corr: { diff: 0, pct: 0 },
    workfronts: { diff: 0, pct: 0 },
  };
}

export async function getTeamKpis({
  team,
  tags = [],
  yearScope,
}: {
  team?: string;
  tags?: number[];
  yearScope?: string | undefined;
}) {
  if (tags.length === 0 && (!team || team === "Todas") && (!yearScope || yearScope === "all")) {
    const [row] = await sql`SELECT * FROM mv_overview`;
    return row as {
      vulns: number;
      vulns_corr: number;
      vulns_nao_corr: number;
      qids: number;
      assets: number;
      qds: number;
      qds_corr: number;
      workfronts: number;
    };
  }

  const viewKey = tags.length === 0 && (!yearScope || yearScope === "all") ? teamViewKey(team) : undefined;
  if (viewKey) {
    const [row] =
      await sql`SELECT * FROM mv_team_overview WHERE team = ${viewKey.team} AND scope = ${viewKey.scope}`;
    return (row ?? {
      vulns: 0,
      vulns_corr: 0,
      vulns_nao_corr: 0,
      qids: 0,
      assets: 0,
      qds: 0,
      qds_corr: 0,
      workfronts: 0,
    }) as {
      vulns: number;
      vulns_corr: number;
      vulns_nao_corr: number;
      qids: number;
      assets: number;
      qds: number;
      qds_corr: number;
      workfronts: number;
    };
  }

  const cte = assetCteSql(team, tags);
  const yearFilter = yearFilterSql(yearScope);
  const [row] = await sql`
    ${cte}
    SELECT
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE kb.solution IS NOT NULL)::int as "vulns_corr",
      COUNT(*) FILTER (WHERE kb.solution IS NULL)::int as "vulns_nao_corr",
      COUNT(DISTINCT v."QID")::int as "qids",
      COUNT(DISTINCT v."QG_HostID")::int as "assets",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100), 1), 0)::float as "qds",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100) FILTER (WHERE kb.solution IS NOT NULL), 1), 0)::float as "qds_corr",
      COUNT(DISTINCT kb.category)::int as "workfronts"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${yearFilter}
  `;
  return row as {
    vulns: number;
    vulns_corr: number;
    vulns_nao_corr: number;
    qids: number;
    assets: number;
    qds: number;
    qds_corr: number;
    workfronts: number;
  };
}

export async function getTeamChartSev({
  team,
  tags = [],
  yearScope,
}: {
  team?: string;
  tags?: number[];
  yearScope?: string | undefined;
}) {
  if (tags.length === 0 && (!team || team === "Todas") && (!yearScope || yearScope === "all")) {
    const rows = await sql`SELECT sev, total FROM mv_chart_sev`;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r["sev"], (map.get(r["sev"]) ?? 0) + r["total"]);
    return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
  }

  const viewKey = tags.length === 0 && (!yearScope || yearScope === "all") ? teamViewKey(team) : undefined;
  if (viewKey) {
    const rows =
      await sql`SELECT sev, total FROM mv_team_chart_sev WHERE team = ${viewKey.team} AND scope = ${viewKey.scope}`;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r["sev"], (map.get(r["sev"]) ?? 0) + r["total"]);
    return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
  }

  const cte = assetCteSql(team, tags);
  const yearFilter = yearFilterSql(yearScope);
  const rows = await sql`
    ${cte}
    SELECT ${severityLabelExpr()} as "sev", COUNT(*)::int as "total"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${yearFilter}
    GROUP BY ${severityLabelExpr()}
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r["sev"], (map.get(r["sev"]) ?? 0) + r["total"]);
  return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
}

export async function getTeamSla({
  team,
  tags = [],
  yearScope,
}: {
  team?: string;
  tags?: number[];
  yearScope?: string | undefined;
}) {
  if (tags.length === 0 && (!team || team === "Todas") && (yearScope === "current" || yearScope === undefined)) {
    const rows =
      await sql`SELECT sev, "DentroSLA_Corr", "DentroSLA_NaoCorr", "ForaSLA_Corr", "ForaSLA_NaoCorr" FROM mv_sla_current_year`;
    const result: Record<string, SlaBucket> = {};
    for (const s of SEVERITY_ORDER) {
      const row = rows.find((r) => r["sev"] === s);
      result[s] = row
        ? {
            DentroSLA_Corr: row["DentroSLA_Corr"],
            DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
            ForaSLA_Corr: row["ForaSLA_Corr"],
            ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
          }
        : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
    }
    return result;
  }

  if (tags.length === 0 && (!team || team === "Todas") && yearScope === "all") {
    const rows =
      await sql`SELECT sev, "DentroSLA_Corr", "DentroSLA_NaoCorr", "ForaSLA_Corr", "ForaSLA_NaoCorr" FROM mv_sla`;
    const result: Record<string, SlaBucket> = {};
    for (const s of SEVERITY_ORDER) {
      const row = rows.find((r) => r["sev"] === s);
      result[s] = row
        ? {
            DentroSLA_Corr: row["DentroSLA_Corr"],
            DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
            ForaSLA_Corr: row["ForaSLA_Corr"],
            ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
          }
        : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
    }
    return result;
  }

  const currentViewKey = tags.length === 0 && (yearScope === "current" || yearScope === undefined) ? teamViewKey(team) : undefined;
  if (currentViewKey) {
    const rows =
      await sql`SELECT sev, "DentroSLA_Corr", "DentroSLA_NaoCorr", "ForaSLA_Corr", "ForaSLA_NaoCorr" FROM mv_team_sla_current_year WHERE team = ${currentViewKey.team} AND scope = ${currentViewKey.scope}`;
    const result: Record<string, SlaBucket> = {};
    for (const s of SEVERITY_ORDER) {
      const row = rows.find((r) => r["sev"] === s);
      result[s] = row
        ? {
            DentroSLA_Corr: row["DentroSLA_Corr"],
            DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
            ForaSLA_Corr: row["ForaSLA_Corr"],
            ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
          }
        : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
    }
    return result;
  }

  const viewKey = tags.length === 0 && yearScope === "all" ? teamViewKey(team) : undefined;
  if (viewKey) {
    const rows =
      await sql`SELECT sev, "DentroSLA_Corr", "DentroSLA_NaoCorr", "ForaSLA_Corr", "ForaSLA_NaoCorr" FROM mv_team_sla WHERE team = ${viewKey.team} AND scope = ${viewKey.scope}`;
    const result: Record<string, SlaBucket> = {};
    for (const s of SEVERITY_ORDER) {
      const row = rows.find((r) => r["sev"] === s);
      result[s] = row
        ? {
            DentroSLA_Corr: row["DentroSLA_Corr"],
            DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
            ForaSLA_Corr: row["ForaSLA_Corr"],
            ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
          }
        : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
    }
    return result;
  }

  const cte = assetCteSql(team, tags);
  const yearFilter = yearFilterSql(yearScope);
  const rows = await sql`
    ${cte}
    , base AS (
      SELECT ${severityLabelExpr()} as sev_label, kb.solution, ${ageExpr()} as age, ${thresholdExpr()} as threshold
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN kb_summary kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${yearFilter}
    )
    SELECT
      sev_label as "sev",
      COUNT(*) FILTER (WHERE age <= threshold AND solution IS NOT NULL)::int as "DentroSLA_Corr",
      COUNT(*) FILTER (WHERE age <= threshold AND solution IS NULL)::int as "DentroSLA_NaoCorr",
      COUNT(*) FILTER (WHERE age > threshold AND solution IS NOT NULL)::int as "ForaSLA_Corr",
      COUNT(*) FILTER (WHERE age > threshold AND solution IS NULL)::int as "ForaSLA_NaoCorr"
    FROM base
    GROUP BY sev_label
  `;
  const result: Record<string, SlaBucket> = {};
  for (const s of SEVERITY_ORDER) {
    const row = rows.find((r) => r["sev"] === s);
    result[s] = row
      ? {
          DentroSLA_Corr: row["DentroSLA_Corr"],
          DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
          ForaSLA_Corr: row["ForaSLA_Corr"],
          ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
        }
      : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
  }
  return result;
}

export async function getTeamRaw({
  team,
  tags = [],
  yearScope,
}: {
  team?: string;
  tags?: number[];
  yearScope?: string | undefined;
}) {
  if (tags.length === 0 && (!team || team === "Todas") && (!yearScope || yearScope === "all")) {
    const rows = await sql`SELECT sev, action, total, avg_age, qids FROM mv_raw`;
    const result: Record<string, SeverityBlock> = {};
    for (const s of SEVERITY_ORDER) {
      result[s] = { total: 0, actions: {} };
    }
    for (const r of rows) {
      const block = result[r["sev"]];
      if (!block) continue;
      block.total += r["total"];
      block.actions[r["action"]] = {
        total: r["total"],
        avg_age: r["avg_age"],
        qids: r["qids"],
      };
    }
    return result;
  }

  const viewKey = tags.length === 0 && (!yearScope || yearScope === "all") ? teamViewKey(team) : undefined;
  if (viewKey) {
    const rows =
      await sql`SELECT sev, action, total, avg_age, qids FROM mv_team_raw WHERE team = ${viewKey.team} AND scope = ${viewKey.scope}`;
    const result: Record<string, SeverityBlock> = {};
    for (const s of SEVERITY_ORDER) {
      result[s] = { total: 0, actions: {} };
    }
    for (const r of rows) {
      const block = result[r["sev"]];
      if (!block) continue;
      block.total += r["total"];
      block.actions[r["action"]] = {
        total: r["total"],
        avg_age: r["avg_age"],
        qids: r["qids"],
      };
    }
    return result;
  }

  const cte = assetCteSql(team, tags);
  const yearFilter = yearFilterSql(yearScope);
  const rows = await sql`
    ${cte}
    , base AS (
      SELECT ${severityLabelExpr()} as sev_label, v."QID", COALESCE(kb.category, 'Unknown') as "action", ${ageExpr()} as age
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN kb_summary kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${yearFilter}
    )
    SELECT
      sev_label as "sev",
      "action",
      COUNT(*)::int as "total",
      ROUND(AVG(age)::numeric, 1)::float as "avg_age",
      COUNT(DISTINCT "QID")::int as "qids"
    FROM base
    GROUP BY sev_label, "action"
  `;
  const result: Record<string, SeverityBlock> = {};
  for (const s of SEVERITY_ORDER) {
    result[s] = { total: 0, actions: {} };
  }
  for (const r of rows) {
    const block = result[r["sev"]];
    if (!block) continue;
    block.total += r["total"];
    block.actions[r["action"]] = {
      total: r["total"],
      avg_age: r["avg_age"],
      qids: r["qids"],
    };
  }
  return result;
}

export async function getTeamData({
  team,
  tags = [],
  yearScope,
}: {
  team: string;
  tags?: number[];
  yearScope?: string | undefined;
}): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getTeamKpis({ team, tags, yearScope }),
    getTeamChartSev({ team, tags, yearScope }),
    getTeamSla({ team, tags, yearScope }),
    getTeamRaw({ team, tags, yearScope }),
  ]);
  return { kpis, trends: makeTrends(), chartSev, slaData, raw };
}

export async function getOverview({ tags = [] }: { tags?: number[] }): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getTeamKpis({ tags }),
    getTeamChartSev({ tags }),
    getTeamSla({ tags }),
    getTeamRaw({ tags }),
  ]);
  return { kpis, trends: makeTrends(), chartSev, slaData, raw };
}

export async function getAllTeamsData({
  yearScope,
}: { yearScope?: string | undefined } = {}): Promise<Record<string, TeamData>> {
  const teams =
    await sql`SELECT DISTINCT team FROM mv_team_overview WHERE scope = 'full' ORDER BY team`;
  const result: Record<string, TeamData> = {};
  for (const { team } of teams) {
    result[team as string] = await getTeamData({ team: team as string, yearScope });
  }
  return result;
}

export async function getTags() {
  return sql<{ id: number; name: string }[]>`
    SELECT id, name
    FROM tags
    ORDER BY name
  `;
}

export async function getQids({
  sla,
  sev,
  team,
  q,
  tags = [],
  categories,
  statuses,
  yearScope,
}: {
  sla?: QidSlaFilter | undefined;
  sev?: string[] | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tags?: number[];
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
  yearScope?: string | undefined;
}): Promise<QidRow[]> {
  const catFilter = categoriesFilterSql(categories);
  const statusFilter = statusesFilterSql(statuses);
  const yearFilter = yearFilterSql(yearScope);

  if (
    !sla &&
    (!team || team === "Todas") &&
    (!sev || sev.length === 0) &&
    !q &&
    !categories &&
    !statuses &&
    tags.length === 0 &&
    (yearScope === "current" || yearScope === undefined)
  ) {
    const rows = await sql`SELECT *, ${qidSlaUnavailableSql()} AS sla FROM mv_top_qids_current_year`;
    return enrichQidSlaRows(await enrichQidRows(
      rows.map((r) => ({
        qid: r["qid"],
        title: r["title"] ?? "",
        sev: r["sev"],
        team: r["team"],
        action: r["action"] ?? "Unknown",
        count: r["count"],
        corr: r["corr"],
        naoCorr: r["naoCorr"],
        age: r["age"],
        solution: r["solution"] ?? "",
        status: r["status"] ?? "",
        sla: r["sla"],
      })),
    ), { assets: assetCteSql(undefined, []), year: yearFilter });
  }

  if (
    !sla &&
    (!team || team === "Todas") &&
    (!sev || sev.length === 0) &&
    !q &&
    !categories &&
    !statuses &&
    tags.length === 0 &&
    yearScope === "all"
  ) {
    const rows = await sql`SELECT *, ${qidSlaUnavailableSql()} AS sla FROM mv_top_qids`;
    return enrichQidSlaRows(await enrichQidRows(
      rows.map((r) => ({
        qid: r["qid"],
        title: r["title"] ?? "",
        sev: r["sev"],
        team: r["team"],
        action: r["action"] ?? "Unknown",
        count: r["count"],
        corr: r["corr"],
        naoCorr: r["naoCorr"],
        age: r["age"],
        solution: r["solution"] ?? "",
        status: r["status"] ?? "",
        sla: r["sla"],
      })),
    ), { assets: assetCteSql(undefined, []), year: yearFilter });
  }

  const cte = assetCteSql(team, tags);
  const sevNums = sev?.map((s) => Number(s)).filter((n) => !Number.isNaN(n));
  const sevFilter =
    sevNums && sevNums.length > 0 ? sql`AND v."Severity"::int IN ${sql(sevNums)}` : sql``;
  const qFilter = q
    ? sql`AND (kb.title ILIKE ${`%${q}%`} OR kb.category ILIKE ${`%${q}%`} OR v."QID"::text ILIKE ${`%${q}%`})`
    : sql``;
  const teamExpr = team && team !== "Todas" ? sql`${team}` : sql`COALESCE(v.team, 'Unknown')`;

  const rows = await sql`
    ${cte}
    , eligible_detections AS MATERIALIZED (
      SELECT v."QID", v."Severity", v."Status", v."Last_Found_Datetime", a.team
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${sevFilter}
        ${statusFilter}
        ${yearFilter}
    ), qid_candidates AS MATERIALIZED (
      SELECT DISTINCT "QID" AS qid FROM eligible_detections
    )
    ${qidMetadataCtesSql()}
    , sla_detections AS MATERIALIZED (
      SELECT v."QID" AS qid, ${teamExpr} AS team,
        COALESCE(kb.category, 'Unknown') AS action, ${severityLabelExpr()} AS sev,
        v."Status" AS status, v."Last_Found_Datetime" AS last_found
      FROM eligible_detections v LEFT JOIN qid_metadata kb ON v."QID" = kb.qid
      WHERE TRUE ${qFilter} ${catFilter}
    )
    ${qidSlaCtesSql()}
    , qid_groups AS (
    SELECT
      v."QID"::int as "qid",
      v."QID" AS source_qid,
      MAX(kb.title) as "title",
      ${severityLabelExpr()} as "sev",
      ${teamExpr} as "team",
      COALESCE(kb.category, 'Unknown') as "action",
      COUNT(*)::int as "count",
      COUNT(*) FILTER (WHERE kb.has_summary_solution IS TRUE)::int as "corr",
      COUNT(*) FILTER (WHERE kb.has_summary_solution IS NOT TRUE)::int as "naoCorr",
      MAX(${ageExpr()})::int as "age",
      MAX(kb.solution) as "solution",
      MAX(v."Status") as "Status"
    FROM eligible_detections v
    LEFT JOIN qid_metadata kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      ${qFilter}
      ${catFilter}
    GROUP BY v."QID", ${teamExpr}, COALESCE(kb.category, 'Unknown'), ${severityLabelExpr()}
    )
    SELECT grouped.qid, grouped.title, grouped.sev, grouped.team, grouped.action,
      grouped.count, grouped.corr, grouped."naoCorr", grouped.age, grouped.solution,
      grouped."Status", deadlines.sla
    FROM qid_groups grouped
    JOIN qid_sla deadlines ON deadlines.qid = grouped.source_qid
      AND deadlines.team = grouped.team AND deadlines.action = grouped.action AND deadlines.sev = grouped.sev
    WHERE TRUE ${qidSlaPredicateSql(sla)}
    ORDER BY grouped.count DESC
    LIMIT 120
  `;
  return rows.map((r) => ({
    qid: r["qid"],
    title: r["title"] ?? "",
    sev: r["sev"],
    team: r["team"],
    action: r["action"],
    count: r["count"],
    corr: r["corr"],
    naoCorr: r["naoCorr"],
    age: r["age"],
    solution: r["solution"] ?? "",
    status: r["Status"] ?? "",
    sla: r["sla"],
  }));
}

export async function getQidAssets({ row, filters, page }: QidAssetsInput): Promise<QidAssetsResponse> {
  const severityBuckets = { Crítica: [5], Alta: [4], Média: [2, 3], Baixa: [1] };
  const severities = severityBuckets[row.sev].filter(
    (severity) => filters.sev.length === 0 || filters.sev.includes(String(severity)),
  );
  const cte = assetCteSql(filters.team, filters.tags, sql`, a."IP", a."DNS", a."OS"`);
  const teamExpr = filters.team && filters.team !== "Todas"
    ? sql`${filters.team}` : sql`COALESCE(v.team, 'Unknown')`;
  const search = filters.q
    ? sql`AND (kb.title ILIKE ${`%${filters.q}%`} OR kb.category ILIKE ${`%${filters.q}%`} OR v."QID"::text ILIKE ${`%${filters.q}%`})`
    : sql``;
  const rows = await sql<[QidAssetsResponse]>`
    ${cte}
    , eligible_detections AS MATERIALIZED (
      SELECT v."QG_HostID", v."QID", a.team, a."IP", a."DNS", a."OS"
      FROM vulnerabilities v
      JOIN filtered_assets a ON a."QG_HostID" = v."QG_HostID"
      WHERE v."QID" = ${String(row.qid)}
        AND v."Severity"::int = ANY(${severities}::int[])
        ${statusesFilterSql(filters.statuses)}
        ${yearFilterSql(filters.yearScope)}
    ), qid_candidates AS MATERIALIZED (
      SELECT DISTINCT "QID" AS qid FROM eligible_detections
    )
    ${qidMetadataCtesSql()}
    , hosts AS MATERIALIZED (
      SELECT v."QG_HostID"::text AS "qgHostId",
        COALESCE(v."DNS", '') AS dns, COALESCE(v."IP", '') AS ip,
        COALESCE(v."OS", '') AS os, COALESCE(v.team, 'Unknown') AS team,
        COUNT(*)::int AS "detectionCount"
      FROM eligible_detections v
      LEFT JOIN qid_metadata kb ON kb.qid = v."QID"
      WHERE ${teamExpr} = ${row.team}
        AND COALESCE(kb.category, 'Unknown') = ${row.action}
        ${search}
        ${categoriesFilterSql(filters.categories)}
      GROUP BY v."QG_HostID", v."DNS", v."IP", v."OS", v.team
    ), host_page AS (
      SELECT "qgHostId", dns, ip, os, team, "detectionCount" FROM hosts
      ORDER BY "qgHostId" COLLATE "C"
      LIMIT 50 OFFSET ${(page - 1) * 50}
    )
    SELECT COALESCE((SELECT jsonb_agg(to_jsonb(host_page) ORDER BY "qgHostId" COLLATE "C")
      FROM host_page), '[]'::jsonb) AS assets,
      (SELECT COUNT(*)::int FROM hosts) AS "totalAssets",
      (SELECT COALESCE(SUM("detectionCount"), 0)::int FROM hosts) AS "totalDetections",
      ${page}::int AS page, 50::int AS "pageSize"
  `;
  return rows[0];
}

export type VulnerabilityStats = {
  total: number;
  critical: number;
  criticalPatchable: number;
  cisaKev: number;
  ransomware: number;
  bySeverity: Record<string, number>;
  bySeverityNumber: Record<string, number>;
  byCategory: { category: string; count: number }[];
};

export async function getVulnerabilityStats({
  team,
  tags = [],
  categories,
  statuses,
  q,
  yearScope,
}: {
  team?: string | undefined;
  tags?: number[];
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
  q?: string | undefined;
  yearScope?: string | undefined;
}): Promise<VulnerabilityStats> {
  const cte = assetCteSql(team, tags);
  const qFilter = q
    ? sql`AND (kb.title ILIKE ${`%${q}%`} OR kb.category ILIKE ${`%${q}%`} OR v."QID"::text ILIKE ${`%${q}%`})`
    : sql``;
  const catFilter = categoriesFilterSql(categories);
  const statusFilter = statusesFilterSql(statuses);
  const yearFilter = yearFilterSql(yearScope);

  const [row] = await sql<VulnerabilityStats[]>`
    ${cte}
    , eligible_detections AS MATERIALIZED (
      SELECT v."QID", v."Severity"
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${statusFilter}
        ${yearFilter}
    ), qid_candidates AS MATERIALIZED (
      SELECT DISTINCT "QID" AS qid FROM eligible_detections
    )
    ${qidMetadataCtesSql()}
    , base AS (
      SELECT
        v."Severity"::int as sev,
        summary.solution,
        summary.cisa_kev,
        summary.ransomware,
        COALESCE(kb.category, 'Unknown') as category
      FROM eligible_detections v
      LEFT JOIN qid_metadata kb ON v."QID" = kb.qid
      LEFT JOIN kb_summary summary ON v."QID" = summary.qid
      WHERE ${statusFilterSql()}
        ${qFilter}
        ${catFilter}
    ),
    base_for_categories AS (
      SELECT COALESCE(kb.category, 'Unknown') as category
      FROM eligible_detections v
      LEFT JOIN qid_metadata kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        ${qFilter}
    )
    SELECT
      (SELECT COUNT(*)::int FROM base) as "total",
      (SELECT COUNT(*)::int FROM base WHERE sev = 5) as "critical",
      (SELECT COUNT(*)::int FROM base WHERE sev = 5 AND solution IS NOT NULL) as "criticalPatchable",
      (SELECT COUNT(*)::int FROM base WHERE cisa_kev = true) as "cisaKev",
      (SELECT COUNT(*)::int FROM base WHERE ransomware = true) as "ransomware",
      COALESCE((
        SELECT jsonb_object_agg(sev_label, c)
        FROM (
          SELECT
            CASE sev
              WHEN 5 THEN 'Crítica'
              WHEN 4 THEN 'Alta'
              WHEN 3 THEN 'Média'
              WHEN 2 THEN 'Média'
              ELSE 'Baixa'
            END as sev_label,
            COUNT(*)::int as c
          FROM base
          GROUP BY sev_label
        ) sev_counts
      ), '{}') as "bySeverity",
      COALESCE((
        SELECT jsonb_object_agg(sev::text, c)
        FROM (
          SELECT sev, COUNT(*)::int as c
          FROM base
          GROUP BY sev
        ) num_counts
      ), '{}') as "bySeverityNumber",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('category', category, 'count', count) ORDER BY count DESC)
        FROM (
          SELECT category, COUNT(*)::int as count
          FROM base_for_categories
          GROUP BY category
          ORDER BY count DESC
          LIMIT 12
        ) cat_counts
      ), '[]') as "byCategory"
  `;

  return {
    total: row?.total ?? 0,
    critical: row?.critical ?? 0,
    criticalPatchable: row?.criticalPatchable ?? 0,
    cisaKev: row?.cisaKev ?? 0,
    ransomware: row?.ransomware ?? 0,
    bySeverity: row?.bySeverity ?? {},
    bySeverityNumber: row?.bySeverityNumber ?? {},
    byCategory: row?.byCategory ?? [],
  };
}

export async function getAssets({
  team,
  q,
  tags = [],
  yearScope,
}: {
  team?: string | undefined;
  q?: string | undefined;
  tags?: number[];
  yearScope?: string | undefined;
}): Promise<AssetRow[]> {
  if (tags.length === 0 && (!team || team === "Todas") && !q && (yearScope === "current" || yearScope === undefined)) {
    const rows = await sql`SELECT * FROM mv_top_assets_current_year`;
    return rows.map((r) => ({
      ip: r["ip"],
      dns: r["dns"],
      os: r["os"],
      team: r["team"],
      vulns: r["vulns"],
      maxAge: r["maxAge"],
      crit: r["crit"],
    }));
  }

  if (tags.length === 0 && (!team || team === "Todas") && !q && yearScope === "all") {
    const rows = await sql`SELECT * FROM mv_top_assets`;
    return rows.map((r) => ({
      ip: r["ip"],
      dns: r["dns"],
      os: r["os"],
      team: r["team"],
      vulns: r["vulns"],
      maxAge: r["maxAge"],
      crit: r["crit"],
    }));
  }

  const qFilter = q
    ? sql`AND (a."IP" ILIKE ${`%${q}%`} OR a."DNS" ILIKE ${`%${q}%`} OR a."OS" ILIKE ${`%${q}%`})`
    : sql``;
  const yearFilter = yearFilterSql(yearScope);
  const cte = assetCteSql(team, tags, sql`, a."IP", a."DNS", a."OS"`);

  const rows = await sql`
    ${cte}
    SELECT
      a."IP" as "ip",
      COALESCE(a."DNS", '') as "dns",
      COALESCE(a."OS", '') as "os",
      ${extractTeamExpr()} as "team",
      COUNT(*)::int as "vulns",
      MAX(${ageExpr()})::int as "maxAge",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "crit"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${qFilter}
      ${yearFilter}
    GROUP BY a."IP", a."DNS", a."OS", ${extractTeamExpr()}
    ORDER BY vulns DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    ip: r["ip"],
    dns: r["dns"],
    os: r["os"],
    team: r["team"],
    vulns: r["vulns"],
    maxAge: r["maxAge"],
    crit: r["crit"],
  }));
}

export type HardeningCategory = {
  name: string;
  count: number;
  sev: string;
};

export type HardeningQid = {
  qid: number;
  title: string;
  count: number;
  sev: string;
};

export type HardeningData = {
  score: number;
  cloudAssets: number;
  cloudAssetsWithCritical: number;
  cloudVulns: number;
  categories: HardeningCategory[];
  topQids: HardeningQid[];
};

export async function getHardening(): Promise<HardeningData> {
  const activeStatuses = ["Active", "New", "Re-Opened"];
  const statusFilter = statusesFilterSql(activeStatuses);

  const [summary] = await sql`
    WITH cloud_assets AS MATERIALIZED (
      SELECT DISTINCT ON ("QG_HostID") "QG_HostID"
      FROM "All_Assets"
      WHERE is_cloud = true
    )
    SELECT
      (SELECT COUNT(*)::int FROM cloud_assets) as "cloudAssets",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "cloudAssetsWithCritical",
      COUNT(*)::int as "cloudVulns"
    FROM cloud_assets a
    JOIN vulnerabilities v ON v."QG_HostID" = a."QG_HostID"
    WHERE ${statusFilterSql()}
      ${statusFilter}
  `;

  const categories = await sql`
    WITH cloud_assets AS MATERIALIZED (
      SELECT DISTINCT ON ("QG_HostID") "QG_HostID"
      FROM "All_Assets"
      WHERE is_cloud = true
    )
    SELECT
      COALESCE(kb.category, 'Unknown') as "name",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM cloud_assets a
    JOIN vulnerabilities v ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      ${statusFilter}
    GROUP BY COALESCE(kb.category, 'Unknown'), ${severityLabelExpr()}
    ORDER BY count DESC
    LIMIT 10
  `;

  const topQids = await sql`
    WITH cloud_assets AS MATERIALIZED (
      SELECT DISTINCT ON ("QG_HostID") "QG_HostID"
      FROM "All_Assets"
      WHERE is_cloud = true
    )
    SELECT
      v."QID"::int as "qid",
      MAX(kb.title) as "title",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM cloud_assets a
    JOIN vulnerabilities v ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      ${statusFilter}
    GROUP BY v."QID", ${severityLabelExpr()}
    ORDER BY count DESC
    LIMIT 10
  `;

  const cloudAssets = (summary?.["cloudAssets"] as number) ?? 0;
  const cloudAssetsWithCritical = (summary?.["cloudAssetsWithCritical"] as number) ?? 0;
  const cloudVulns = (summary?.["cloudVulns"] as number) ?? 0;
  const score = cloudAssets
    ? Math.round(((cloudAssets - cloudAssetsWithCritical) / cloudAssets) * 100)
    : 0;

  return {
    score,
    cloudAssets,
    cloudAssetsWithCritical,
    cloudVulns,
    categories: categories.map((r) => ({
      name: r["name"] ?? "Unknown",
      count: r["count"] as number,
      sev: r["sev"] as string,
    })),
    topQids: topQids.map((r) => ({
      qid: r["qid"] as number,
      title: r["title"] ?? "Sem título",
      count: r["count"] as number,
      sev: r["sev"] as string,
    })),
  };
}

export type ReportKpis = {
  totalAssets: number;
  assetsWithCritical: number;
  complianceScore: number;
  totalVulns: number;
};

export type ReportOsRow = {
  os: string;
  assets: number;
  vulns: number;
  critical: number;
  compliancePct: number;
};

export type ReportTopQid = {
  qid: number;
  title: string;
  sev: string;
  count: number;
};

export type ReportCategory = {
  name: string;
  count: number;
  sev: string;
};

export type ReportAsset = {
  qgHostId: string;
  hostname: string;
  ip: string;
  os: string;
  team: string;
  vulns: number;
  critical: number;
  compliancePct: number;
};

export type ReportData = {
  kpis: ReportKpis;
  osRows: ReportOsRow[];
  topQids: ReportTopQid[];
  categories: ReportCategory[];
  assets: ReportAsset[];
  teamRows: {
    team: string;
    assets: number;
    vulns: number;
    critical: number;
    compliancePct: number;
  }[];
};

async function loadReportsFromViews(views: {
  summary: string;
  os: string;
  topqids: string;
  categories: string;
  assets: string;
  teamrows: string;
}): Promise<ReportData> {
  const [kpis] = await sql`SELECT * FROM ${sql.unsafe(views.summary)}`;
  const osRows = await sql`SELECT * FROM ${sql.unsafe(views.os)}`;
  const topQids = await sql`SELECT * FROM ${sql.unsafe(views.topqids)}`;
  const categories = await sql`SELECT * FROM ${sql.unsafe(views.categories)}`;
  const assets = await sql`SELECT * FROM ${sql.unsafe(views.assets)}`;
  const teamRows = await sql`SELECT * FROM ${sql.unsafe(views.teamrows)}`;

  const totalAssets = (kpis?.["totalAssets"] as number) ?? 0;
  const assetsWithCritical = (kpis?.["assetsWithCritical"] as number) ?? 0;
  const complianceScore = totalAssets
    ? Math.round(((totalAssets - assetsWithCritical) / totalAssets) * 100)
    : 0;

  return {
    kpis: {
      totalAssets,
      assetsWithCritical,
      complianceScore,
      totalVulns: (kpis?.["totalVulns"] as number) ?? 0,
    },
    osRows: osRows.map((r) => {
      const assets = (r["assets"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        os: (r["os"] as string) ?? "Unknown",
        assets,
        vulns: (r["vulns"] as number) ?? 0,
        critical,
        compliancePct: assets ? Math.round(((assets - critical) / assets) * 100) : 0,
      };
    }),
    topQids: topQids.map((r) => ({
      qid: (r["qid"] as number) ?? 0,
      title: (r["title"] as string) ?? "Sem título",
      sev: (r["sev"] as string) ?? "Baixa",
      count: (r["count"] as number) ?? 0,
    })),
    categories: categories.map((r) => ({
      name: (r["name"] as string) ?? "Unknown",
      count: (r["count"] as number) ?? 0,
      sev: (r["sev"] as string) ?? "Baixa",
    })),
    assets: assets.map((r) => {
      const assetVulns = (r["vulns"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        qgHostId: (r["qgHostId"] as string) ?? "",
        hostname: (r["hostname"] as string) ?? "",
        ip: (r["ip"] as string) ?? "",
        os: (r["os"] as string) ?? "Unknown",
        team: (r["team"] as string) ?? "Unknown",
        vulns: assetVulns,
        critical,
        compliancePct: assetVulns
          ? Math.round(((assetVulns - critical) / assetVulns) * 100)
          : 100,
      };
    }),
    teamRows: teamRows.map((r) => {
      const assets = (r["assets"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        team: (r["team"] as string) ?? "Unknown",
        assets,
        vulns: (r["vulns"] as number) ?? 0,
        critical,
        compliancePct: assets ? Math.round(((assets - critical) / assets) * 100) : 0,
      };
    }),
  };
}

export async function getReports({
  team,
  os,
  tags = [],
  statuses,
  yearScope,
}: {
  team?: string | undefined;
  os?: string | undefined;
  tags?: number[];
  statuses?: string[] | undefined;
  yearScope?: string | undefined;
}): Promise<ReportData> {
  if (
    tags.length === 0 &&
    !team &&
    !os &&
    !statuses &&
    (yearScope === "current" || yearScope === undefined)
  ) {
    return loadReportsFromViews({
      summary: "mv_report_summary_current_year",
      os: "mv_report_os_current_year",
      topqids: "mv_report_topqids_current_year",
      categories: "mv_report_categories_current_year",
      assets: "mv_report_assets_current_year",
      teamrows: "mv_report_teamrows_current_year",
    });
  }

  if (tags.length === 0 && !team && !os && !statuses && yearScope === "all") {
    return loadReportsFromViews({
      summary: "mv_report_summary",
      os: "mv_report_os",
      topqids: "mv_report_topqids",
      categories: "mv_report_categories",
      assets: "mv_report_assets",
      teamrows: "mv_report_teamrows",
    });
  }

  const osFilter = os ? sql`AND a."OS" ILIKE ${`%${os}%`}` : sql``;
  const yearFilter = yearFilterSql(yearScope);
  const statusFilter = statusesFilterSql(statuses);
  const cte = assetCteSql(team, tags, sql`, a."IP", a."DNS", a."OS"`);

  const [kpis] = await sql`
    ${cte}
    SELECT
      COUNT(DISTINCT a."QG_HostID")::int as "totalAssets",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "assetsWithCritical",
      COUNT(*)::int as "totalVulns"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
  `;

  const osRows = await sql`
    ${cte}
    SELECT
      COALESCE(a."OS", 'Unknown') as "os",
      COUNT(DISTINCT a."QG_HostID")::int as "assets",
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
    GROUP BY a."OS"
    ORDER BY vulns DESC
    LIMIT 20
  `;

  const topQids = await sql`
    ${cte}
    SELECT
      v."QID"::int as "qid",
      MAX(kb.title) as "title",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
    GROUP BY v."QID", ${severityLabelExpr()}
    ORDER BY COUNT(*) DESC
    LIMIT 25
  `;

  const categories = await sql`
    ${cte}
    SELECT
      COALESCE(kb.category, 'Unknown') as "name",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
    GROUP BY COALESCE(kb.category, 'Unknown'), ${severityLabelExpr()}
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `;

  const assets = await sql`
    ${cte}
    SELECT
      a."QG_HostID" as "qgHostId",
      COALESCE(a."DNS", a."IP") as "hostname",
      a."IP" as "ip",
      COALESCE(a."OS", 'Unknown') as "os",
      ${extractTeamExpr()} as "team",
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
    GROUP BY a."QG_HostID", a."DNS", a."IP", a."OS", a.team
    ORDER BY vulns DESC
    LIMIT 100
  `;

  const teamRows = await sql`
    ${cte}
    SELECT
      ${extractTeamExpr()} as "team",
      COUNT(DISTINCT a."QG_HostID")::int as "assets",
      COUNT(*)::int as "vulns",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE TRUE
      AND v."Severity"::int IN (1,2,3,4,5)
      ${statusFilter}
      ${osFilter}
      ${yearFilter}
    GROUP BY ${extractTeamExpr()}
    ORDER BY vulns DESC
    LIMIT 50
  `;

  const totalAssets = (kpis?.["totalAssets"] as number) ?? 0;
  const assetsWithCritical = (kpis?.["assetsWithCritical"] as number) ?? 0;
  const complianceScore = totalAssets
    ? Math.round(((totalAssets - assetsWithCritical) / totalAssets) * 100)
    : 0;

  return {
    kpis: {
      totalAssets,
      assetsWithCritical,
      complianceScore,
      totalVulns: (kpis?.["totalVulns"] as number) ?? 0,
    },
    osRows: osRows.map((r) => {
      const assets = (r["assets"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        os: (r["os"] as string) ?? "Unknown",
        assets,
        vulns: (r["vulns"] as number) ?? 0,
        critical,
        compliancePct: assets ? Math.round(((assets - critical) / assets) * 100) : 0,
      };
    }),
    topQids: topQids.map((r) => ({
      qid: (r["qid"] as number) ?? 0,
      title: (r["title"] as string) ?? "Sem título",
      sev: (r["sev"] as string) ?? "Baixa",
      count: (r["count"] as number) ?? 0,
    })),
    categories: categories.map((r) => ({
      name: (r["name"] as string) ?? "Unknown",
      count: (r["count"] as number) ?? 0,
      sev: (r["sev"] as string) ?? "Baixa",
    })),
    assets: assets.map((r) => {
      const assetVulns = (r["vulns"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        qgHostId: (r["qgHostId"] as string) ?? "",
        hostname: (r["hostname"] as string) ?? "",
        ip: (r["ip"] as string) ?? "",
        os: (r["os"] as string) ?? "Unknown",
        team: (r["team"] as string) ?? "Unknown",
        vulns: assetVulns,
        critical,
        compliancePct: assetVulns ? Math.round(((assetVulns - critical) / assetVulns) * 100) : 100,
      };
    }),
    teamRows: teamRows.map((r) => {
      const assets = (r["assets"] as number) ?? 0;
      const critical = (r["critical"] as number) ?? 0;
      return {
        team: (r["team"] as string) ?? "Unknown",
        assets,
        vulns: (r["vulns"] as number) ?? 0,
        critical,
        compliancePct: assets ? Math.round(((assets - critical) / assets) * 100) : 0,
      };
    }),
  };
}

async function pgStatMtime(): Promise<string | null> {
  try {
    const [row] = await sql`
      SELECT max(last_analyze) as last_refresh
      FROM pg_stat_user_tables
      WHERE relname LIKE ${"mv_%"}
    `;
    const value = row?.last_refresh as Date | string | null;
    if (value instanceof Date) return value.toISOString();
    return value ?? null;
  } catch {
    return null;
  }
}

export async function getLastSync(): Promise<{ lastRefresh: string | null; viewsCount: number }> {
  try {
    const [row] = await sql`
      SELECT last_refresh, views_count
      FROM sync_status
      WHERE id = 1
    `;
    if (!row) {
      return { lastRefresh: await pgStatMtime(), viewsCount: 0 };
    }
    const lastRefresh = row.last_refresh as Date | string | null;
    return {
      lastRefresh: lastRefresh instanceof Date ? lastRefresh.toISOString() : (lastRefresh ?? null),
      viewsCount: (row.views_count as number) ?? 0,
    };
  } catch {
    return { lastRefresh: await pgStatMtime(), viewsCount: 0 };
  }
}
