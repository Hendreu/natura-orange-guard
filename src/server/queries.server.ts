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
  return sql`COALESCE(NULLIF(regexp_replace(a."Tags", '.*(^|[|,])Times:([^|,]+).*', '\\2', 'i'), ''), 'Unknown')`;
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
  return sql`AND a."Tags" ~* ${teamRegex(team)}`;
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

export async function getTeamKpis({
  team,
  tagFilter,
}: {
  team?: string;
  tagFilter?: TagFilter | undefined;
}) {
  const tagSql = tagFilterSql(tagFilter);
  const teamSql = squadFilterSql(team);
  const [row] = await sql`
    SELECT
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE kb."Solution" IS NOT NULL)::int as "vulns_corr",
      COUNT(*) FILTER (WHERE kb."Solution" IS NULL)::int as "vulns_nao_corr",
      COUNT(DISTINCT v."QID")::int as "qids",
      COUNT(DISTINCT v."QG_HostID")::int as "assets",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100), 1), 0)::float as "qds",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100) FILTER (WHERE kb."Solution" IS NOT NULL), 1), 0)::float as "qds_corr",
      COUNT(DISTINCT kb."Category")::int as "workfronts"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamSql}
      ${tagSql}
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
  const tagSql = tagFilterSql(tagFilter);
  const teamSql = squadFilterSql(team);
  const rows = await sql`
    SELECT ${severityLabelExpr()} as "sev", COUNT(*)::int as "total"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamSql}
      ${tagSql}
    GROUP BY v."Severity"::int
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
  const tagSql = tagFilterSql(tagFilter);
  const teamSql = squadFilterSql(team);
  const rows = await sql`
    WITH base AS (
      SELECT v."Severity", kb."Solution", ${ageExpr()} as age, ${thresholdExpr()} as threshold
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${teamSql}
        ${tagSql}
    )
    SELECT
      CASE "Severity"::int WHEN 5 THEN 'Crítica' WHEN 4 THEN 'Alta' WHEN 3 THEN 'Média' ELSE 'Baixa' END as "sev",
      COUNT(*) FILTER (WHERE age <= threshold AND "Solution" IS NOT NULL)::int as "DentroSLA_Corr",
      COUNT(*) FILTER (WHERE age <= threshold AND "Solution" IS NULL)::int as "DentroSLA_NaoCorr",
      COUNT(*) FILTER (WHERE age > threshold AND "Solution" IS NOT NULL)::int as "ForaSLA_Corr",
      COUNT(*) FILTER (WHERE age > threshold AND "Solution" IS NULL)::int as "ForaSLA_NaoCorr"
    FROM base
    GROUP BY "Severity"::int
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
  const tagSql = tagFilterSql(tagFilter);
  const teamSql = squadFilterSql(team);
  const rows = await sql`
    WITH base AS (
      SELECT v."Severity", v."QID", kb."Category", ${ageExpr()} as age
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${teamSql}
        ${tagSql}
    )
    SELECT
      CASE "Severity"::int WHEN 5 THEN 'Crítica' WHEN 4 THEN 'Alta' WHEN 3 THEN 'Média' ELSE 'Baixa' END as "sev",
      "Category" as "action",
      COUNT(*)::int as "total",
      ROUND(AVG(age)::numeric, 1)::float as "avg_age",
      COUNT(DISTINCT "QID")::int as "qids"
    FROM base
    GROUP BY "Severity"::int, "Category"
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
  const trends: Record<string, Trend> = {
    vulns: { diff: 0, pct: 0 },
    qids: { diff: 0, pct: 0 },
    assets: { diff: 0, pct: 0 },
    qds: { diff: 0, pct: 0 },
    qds_corr: { diff: 0, pct: 0 },
    workfronts: { diff: 0, pct: 0 },
  };
  return { kpis, trends, chartSev, slaData, raw };
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
  const trends: Record<string, Trend> = {
    vulns: { diff: 0, pct: 0 },
    qids: { diff: 0, pct: 0 },
    assets: { diff: 0, pct: 0 },
    qds: { diff: 0, pct: 0 },
    qds_corr: { diff: 0, pct: 0 },
    workfronts: { diff: 0, pct: 0 },
  };
  return { kpis, trends, chartSev, slaData, raw };
}

export async function getAllTeamsData(): Promise<Record<string, TeamData>> {
  const result: Record<string, TeamData> = {};
  for (const team of TEAM_NAMES) {
    result[team] = await getTeamData({ team });
  }
  return result;
}

export async function getQids({
  sev,
  team,
  q,
  tagFilter,
}: {
  sev?: string | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
}): Promise<QidRow[]> {
  const teamFilter = squadFilterSql(team);
  const sevFilter = sev && sev !== "Todas" ? sql`AND ${severityLabelExpr()} = ${sev}` : sql``;
  const qFilter = q
    ? sql`AND (kb."Title" ILIKE ${`%${q}%`} OR kb."Category" ILIKE ${`%${q}%`} OR v."QID" ILIKE ${`%${q}%`})`
    : sql``;
  const tagSql = tagFilterSql(tagFilter);
  const teamExpr = team && team !== "Todas" ? sql`${team}` : extractTeamExpr();

  const rows = await sql`
    SELECT
      v."QID"::int as "qid",
      MAX(kb."Title") as "title",
      ${severityLabelExpr()} as "sev",
      ${teamExpr} as "team",
      COALESCE(kb."Category", 'Unknown') as "action",
      COUNT(*)::int as "count",
      COUNT(*) FILTER (WHERE kb."Solution" IS NOT NULL)::int as "corr",
      COUNT(*) FILTER (WHERE kb."Solution" IS NULL)::int as "naoCorr",
      MAX(${ageExpr()})::int as "age",
      MAX(kb."Solution") as "solution"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${sevFilter}
      ${qFilter}
      ${tagSql}
    GROUP BY v."QID", ${teamExpr}, kb."Category", v."Severity"::int
    ORDER BY count DESC
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
  }));
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
  const teamFilter = squadFilterSql(team);
  const qFilter = q
    ? sql`AND (a."IP" ILIKE ${`%${q}%`} OR a."DNS" ILIKE ${`%${q}%`} OR a."OS" ILIKE ${`%${q}%`})`
    : sql``;
  const tagSql = tagFilterSql(tagFilter);

  const rows = await sql`
    SELECT
      a."IP" as "ip",
      COALESCE(a."DNS", '') as "dns",
      COALESCE(a."OS", '') as "os",
      ${extractTeamExpr()} as "team",
      COUNT(*)::int as "vulns",
      MAX(${ageExpr()})::int as "maxAge",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "crit"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${qFilter}
      ${tagSql}
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
  const cloudAssetsFilter = sql`a."Tags" ~* 'Cloud'`;

  const [summary] = await sql`
    SELECT
      COUNT(DISTINCT a."QG_HostID")::int as "cloudAssets",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "cloudAssetsWithCritical",
      COUNT(*)::int as "cloudVulns"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      AND ${cloudAssetsFilter}
  `;

  const categories = await sql`
    SELECT
      COALESCE(kb."Category", 'Unknown') as "name",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      AND ${cloudAssetsFilter}
    GROUP BY kb."Category", v."Severity"::int
    ORDER BY count DESC
    LIMIT 10
  `;

  const topQids = await sql`
    SELECT
      v."QID"::int as "qid",
      MAX(kb."Title") as "title",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      AND ${cloudAssetsFilter}
    GROUP BY v."QID", v."Severity"::int
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

export async function getReports({
  team,
  os,
  tagFilter,
}: {
  team?: string | undefined;
  os?: string | undefined;
  tagFilter?: TagFilter | undefined;
}): Promise<ReportData> {
  const teamFilter = squadFilterSql(team);
  const osFilter = os ? sql`AND a."OS" ILIKE ${`%${os}%`}` : sql``;
  const tagSql = tagFilterSql(tagFilter);

  const [kpis] = await sql`
    SELECT
      COUNT(DISTINCT a."QG_HostID")::int as "totalAssets",
      COUNT(DISTINCT a."QG_HostID") FILTER (WHERE v."Severity"::int = 5)::int as "assetsWithCritical",
      COUNT(*)::int as "totalVulns"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${osFilter}
      ${tagSql}
  `;

  const osRows = await sql`
    SELECT
      COALESCE(a."OS", 'Unknown') as "os",
      COUNT(DISTINCT a."QG_HostID")::int as "assets",
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${osFilter}
      ${tagSql}
    GROUP BY a."OS"
    ORDER BY vulns DESC
    LIMIT 20
  `;

  const topQids = await sql`
    SELECT
      v."QID"::int as "qid",
      MAX(kb."Title") as "title",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${osFilter}
      ${tagSql}
    GROUP BY v."QID", v."Severity"::int
    ORDER BY count DESC
    LIMIT 25
  `;

  const categories = await sql`
    SELECT
      COALESCE(kb."Category", 'Unknown') as "name",
      ${severityLabelExpr()} as "sev",
      COUNT(*)::int as "count"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${osFilter}
      ${tagSql}
    GROUP BY kb."Category", v."Severity"::int
    ORDER BY count DESC
    LIMIT 20
  `;

  const assets = await sql`
    SELECT
      a."QG_HostID" as "qgHostId",
      COALESCE(a."DNS", a."IP") as "hostname",
      a."IP" as "ip",
      COALESCE(a."OS", 'Unknown') as "os",
      ${extractTeamExpr()} as "team",
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${osFilter}
      ${tagSql}
    GROUP BY a."QG_HostID", a."DNS", a."IP", a."OS", a."Tags"
    ORDER BY vulns DESC
    LIMIT 100
  `;

  const teamRows = await sql`
    SELECT
      ${extractTeamExpr()} as "team",
      COUNT(DISTINCT a."QG_HostID")::int as "assets",
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${osFilter}
      ${tagSql}
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
