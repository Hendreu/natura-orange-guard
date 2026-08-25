import sql from "@/lib/db";
import { TEAM_NAMES, SEVERITY_ORDER, ACTIVE_STATUSES } from "@/lib/constants";
import type { TagFilter } from "@/lib/constants";
import type {
  Trend,
  ActionGroup,
  SeverityBlock,
  SlaBucket,
  TeamData,
  QidRow,
  AssetRow,
} from "@/lib/sla-data";

function teamRegex(team: string) {
  return `(^|[|,])Times:${team}([|,]|$)`;
}

function extractTeamExpr() {
  return sql`COALESCE(a.team, 'Unknown')`;
}

function tagFilterSql(tagFilter: TagFilter | undefined) {
  if (tagFilter === "full-cloud") {
    return sql`AND a."Tags" ILIKE ${"%cloud%"}`;
  }
  if (tagFilter === "full-on-premise") {
    return sql`AND (a."Tags" IS NULL OR a."Tags" NOT ILIKE ${"%cloud%"})`;
  }
  return sql``;
}

function squadFilterSql(team: string | undefined) {
  if (!team || team === "Todas") return sql``;
  if (team === "All Cloud") return sql`AND a."Tags" ILIKE ${"%cloud%"}`;
  if (team === "All On-Prem") return sql`AND (a."Tags" IS NULL OR a."Tags" NOT ILIKE ${"%cloud%"})`;
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

function assetCteSql(
  team: string | undefined,
  tagFilter: TagFilter | undefined,
  extraCols = sql``,
) {
  const teamFilter =
    !team || team === "Todas"
      ? sql``
      : team === "All Cloud"
        ? sql`AND a.is_cloud = true`
        : team === "All On-Prem"
          ? sql`AND a.is_cloud = false`
          : sql`AND a.team = ${team}`;
  const tagFilterSql =
    tagFilter === "full-cloud"
      ? sql`AND a.is_cloud = true`
      : tagFilter === "full-on-premise"
        ? sql`AND a.is_cloud = false`
        : sql``;
  return sql`WITH filtered_assets AS MATERIALIZED (SELECT DISTINCT ON (a."QG_HostID") a."QG_HostID", a.team, a.is_cloud ${extraCols} FROM "All_Assets" a WHERE TRUE ${teamFilter} ${tagFilterSql})`;
}

function severityLabelExpr() {
  return sql`CASE v."Severity"::int WHEN 5 THEN 'Crítica' WHEN 4 THEN 'Alta' WHEN 3 THEN 'Média' ELSE 'Baixa' END`;
}

function ageExpr() {
  return sql`ROUND(EXTRACT(EPOCH FROM (now() - v."First_Found_Datetime"::timestamp)) / 86400)::int`;
}

function thresholdExpr() {
  return sql`CASE v."Severity"::int WHEN 5 THEN 15 WHEN 4 THEN 30 WHEN 3 THEN 90 ELSE 180 END`;
}

function statusFilterSql() {
  return sql`TRUE`;
}

function teamViewKey(
  team: string | undefined,
  tagFilter: TagFilter | undefined,
): { team: string; scope: string } | undefined {
  if (!team || team === "Todas") return undefined;
  if (team === "All Cloud") {
    return tagFilter === "full" || tagFilter === "full-cloud"
      ? { team: "All Cloud", scope: "full-cloud" }
      : undefined;
  }
  if (team === "All On-Prem") {
    return tagFilter === "full" || tagFilter === "full-on-premise"
      ? { team: "All On-Prem", scope: "full-on-premise" }
      : undefined;
  }
  if (tagFilter && tagFilter !== "full") return undefined;
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
  tagFilter,
}: {
  team?: string;
  tagFilter?: TagFilter | undefined;
}) {
  if ((!team || team === "Todas") && (!tagFilter || tagFilter === "full")) {
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

  const viewKey = teamViewKey(team, tagFilter);
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

  const cte = assetCteSql(team, tagFilter);
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
  tagFilter,
}: {
  team?: string;
  tagFilter?: TagFilter | undefined;
}) {
  if ((!team || team === "Todas") && (!tagFilter || tagFilter === "full")) {
    const rows = await sql`SELECT sev, total FROM mv_chart_sev`;
    const map = new Map(rows.map((r) => [r["sev"], r["total"]]));
    return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
  }

  const viewKey = teamViewKey(team, tagFilter);
  if (viewKey) {
    const rows =
      await sql`SELECT sev, total FROM mv_team_chart_sev WHERE team = ${viewKey.team} AND scope = ${viewKey.scope}`;
    const map = new Map(rows.map((r) => [r["sev"], r["total"]]));
    return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
  }

  const cte = assetCteSql(team, tagFilter);
  const rows = await sql`
    ${cte}
    SELECT ${severityLabelExpr()} as "sev", COUNT(*)::int as "total"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
    GROUP BY ${severityLabelExpr()}
  `;
  const map = new Map(rows.map((r) => [r["sev"], r["total"]]));
  return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
}

export async function getTeamSla({
  team,
  tagFilter,
}: {
  team?: string;
  tagFilter?: TagFilter | undefined;
}) {
  if ((!team || team === "Todas") && (!tagFilter || tagFilter === "full")) {
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

  const viewKey = teamViewKey(team, tagFilter);
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

  const cte = assetCteSql(team, tagFilter);
  const rows = await sql`
    ${cte}
    , base AS (
      SELECT ${severityLabelExpr()} as sev_label, kb.solution, ${ageExpr()} as age, ${thresholdExpr()} as threshold
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN kb_summary kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
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
  tagFilter,
}: {
  team?: string;
  tagFilter?: TagFilter | undefined;
}) {
  if ((!team || team === "Todas") && (!tagFilter || tagFilter === "full")) {
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

  const viewKey = teamViewKey(team, tagFilter);
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

  const cte = assetCteSql(team, tagFilter);
  const rows = await sql`
    ${cte}
    , base AS (
      SELECT ${severityLabelExpr()} as sev_label, v."QID", COALESCE(kb.category, 'Unknown') as "action", ${ageExpr()} as age
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN kb_summary kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
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
  tagFilter,
}: {
  team: string;
  tagFilter?: TagFilter | undefined;
}): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getTeamKpis({ team, tagFilter }),
    getTeamChartSev({ team, tagFilter }),
    getTeamSla({ team, tagFilter }),
    getTeamRaw({ team, tagFilter }),
  ]);
  return { kpis, trends: makeTrends(), chartSev, slaData, raw };
}

export async function getOverview({
  tagFilter,
}: {
  tagFilter?: TagFilter | undefined;
}): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getTeamKpis({ tagFilter }),
    getTeamChartSev({ tagFilter }),
    getTeamSla({ tagFilter }),
    getTeamRaw({ tagFilter }),
  ]);
  return { kpis, trends: makeTrends(), chartSev, slaData, raw };
}

export async function getAllTeamsData(): Promise<Record<string, TeamData>> {
  const teams =
    await sql`SELECT DISTINCT team FROM mv_team_overview WHERE scope = 'full' ORDER BY team`;
  const result: Record<string, TeamData> = {};
  for (const { team } of teams) {
    result[team as string] = await getTeamData({ team: team as string });
  }
  return result;
}

export async function getQids({
  sev,
  team,
  q,
  tagFilter,
  categories,
  statuses,
}: {
  sev?: string[] | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
}): Promise<QidRow[]> {
  const catFilter = categoriesFilterSql(categories);
  const statusFilter = statusesFilterSql(statuses);

  if (
    (!team || team === "Todas") &&
    (!sev || sev.length === 0) &&
    !q &&
    !categories &&
    !statuses &&
    (!tagFilter || tagFilter === "full")
  ) {
    const rows = await sql`SELECT * FROM mv_top_qids`;
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
      status: r["status"] ?? "",
    }));
  }

  const cte = assetCteSql(team, tagFilter);
  const sevFilter = sev && sev.length > 0 ? sql`AND ${severityLabelExpr()} IN ${sql(sev)}` : sql``;
  const qFilter = q
    ? sql`AND (kb.title ILIKE ${`%${q}%`} OR kb.category ILIKE ${`%${q}%`} OR v."QID"::text ILIKE ${`%${q}%`})`
    : sql``;
  const teamExpr = team && team !== "Todas" ? sql`${team}` : extractTeamExpr();

  const rows = await sql`
    ${cte}
    SELECT
      v."QID"::int as "qid",
      MAX(kb.title) as "title",
      ${severityLabelExpr()} as "sev",
      ${teamExpr} as "team",
      COALESCE(kb.category, 'Unknown') as "action",
      COUNT(*)::int as "count",
      COUNT(*) FILTER (WHERE kb.solution IS NOT NULL)::int as "corr",
      COUNT(*) FILTER (WHERE kb.solution IS NULL)::int as "naoCorr",
      MAX(${ageExpr()})::int as "age",
      MAX(kb.solution) as "solution",
      MAX(v."Status") as "Status"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${sevFilter}
      ${qFilter}
      ${catFilter}
      ${statusFilter}
    GROUP BY v."QID", ${teamExpr}, COALESCE(kb.category, 'Unknown'), ${severityLabelExpr()}
    ORDER BY COUNT(*) DESC
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
  }));
}

export type VulnerabilityStats = {
  total: number;
  critical: number;
  criticalPatchable: number;
  cisaKev: number;
  ransomware: number;
};

export async function getVulnerabilityStats({
  team,
  tagFilter,
  categories,
  statuses,
  q,
}: {
  team?: string | undefined;
  tagFilter?: TagFilter | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
  q?: string | undefined;
}): Promise<VulnerabilityStats> {
  const cte = assetCteSql(team, tagFilter);
  const qFilter = q
    ? sql`AND (kb.title ILIKE ${`%${q}%`} OR kb.category ILIKE ${`%${q}%`} OR v."QID"::text ILIKE ${`%${q}%`})`
    : sql``;
  const catFilter = categoriesFilterSql(categories);
  const statusFilter = statusesFilterSql(statuses);

  const [row] = await sql`
    ${cte}
    , base AS (
      SELECT
        v."Severity"::int as sev,
        kb.solution,
        kb.cisa_kev,
        kb.ransomware,
        COALESCE(kb.category, 'Unknown') as category
      FROM vulnerabilities v
      JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN kb_summary kb ON v."QID" = kb.qid
      WHERE ${statusFilterSql()}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${qFilter}
        ${catFilter}
        ${statusFilter}
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
              ELSE 'Baixa'
            END as sev_label,
            COUNT(*)::int as c
          FROM base
          GROUP BY sev
        ) sev_counts
      ), '{}') as "bySeverity",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('category', category, 'count', count) ORDER BY count DESC)
        FROM (
          SELECT category, COUNT(*)::int as count
          FROM base
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
    bySeverity: (row?.bySeverity as Record<string, number>) ?? {},
    byCategory: (row?.byCategory as { category: string; count: number }[]) ?? [],
  };
}

export async function getAssets({
  team,
  q,
  tagFilter,
}: {
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
}): Promise<AssetRow[]> {
  if ((!team || team === "Todas") && !q && (!tagFilter || tagFilter === "full")) {
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
  const cte = assetCteSql(team, tagFilter, sql`, a."IP", a."DNS", a."OS"`);

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
  const [summary] = await sql`SELECT * FROM mv_hardening_summary`;
  const categories = await sql`SELECT * FROM mv_hardening_categories`;
  const topQids = await sql`SELECT * FROM mv_hardening_topqids`;

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

export async function getReports({
  team,
  os,
  tagFilter,
}: {
  team?: string | undefined;
  os?: string | undefined;
  tagFilter?: TagFilter | undefined;
}): Promise<ReportData> {
  if (!team && !os && (!tagFilter || tagFilter === "full")) {
    const [kpis] = await sql`SELECT * FROM mv_report_summary`;
    const osRows = await sql`SELECT * FROM mv_report_os`;
    const topQids = await sql`SELECT * FROM mv_report_topqids`;
    const categories = await sql`SELECT * FROM mv_report_categories`;
    const assets = await sql`SELECT * FROM mv_report_assets`;
    const teamRows = await sql`SELECT * FROM mv_report_teamrows`;

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

  const osFilter = os ? sql`AND a."OS" ILIKE ${`%${os}%`}` : sql``;
  const cte = assetCteSql(team, tagFilter, sql`, a."IP", a."DNS", a."OS"`);

  const [kpis] = await sql`
    ${cte}
    SELECT
      COUNT(DISTINCT a."QG_HostID")::int as "totalAssets",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "assetsWithCritical",
      COUNT(*)::int as "totalVulns"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
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
