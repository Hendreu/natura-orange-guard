import { queryOptions } from "@tanstack/react-query";
import { TEAM_NAMES, SEVERITY_ORDER, type TagFilter } from "./constants";
import {
  fetchTeamData,
  fetchOverview,
  fetchAllTeamsData,
  fetchQids,
  fetchAssets,
  fetchHardening,
  fetchReports,
  fetchVulnerabilityStats,
  fetchLastSync,
} from "./data.fn";

export type Trend = { diff: number; pct: number };

export type ActionGroup = {
  total: number;
  avg_age: number;
  qids: number;
};

export type SeverityBlock = {
  total: number;
  actions: Record<string, ActionGroup>;
};

export type SlaBucket = {
  DentroSLA_Corr: number;
  DentroSLA_NaoCorr: number;
  ForaSLA_Corr: number;
  ForaSLA_NaoCorr: number;
};

export type TeamData = {
  kpis: {
    vulns: number;
    vulns_corr: number;
    vulns_nao_corr: number;
    qids: number;
    assets: number;
    qds: number;
    qds_corr: number;
    workfronts: number;
  };
  trends: Record<string, Trend>;
  chartSev: number[];
  slaData: Record<string, SlaBucket>;
  raw: Record<string, SeverityBlock>;
};

export type Severity = (typeof SEVERITY_ORDER)[number];

export const teamNames = [...TEAM_NAMES] as string[];
export const severityOrder = [...SEVERITY_ORDER] as string[];

export const severityToken: Record<string, string> = {
  Crítica: "var(--critica)",
  Alta: "var(--alta)",
  Média: "var(--media)",
  Baixa: "var(--baixa)",
};

export function fmt(n: number) {
  return n.toLocaleString("pt-BR");
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

export type QidRow = {
  qid: number;
  title: string;
  sev: string;
  team: string;
  action: string;
  count: number;
  corr: number;
  naoCorr: number;
  age: number;
  solution: string;
  status: string;
};

export type AssetRow = {
  ip: string;
  dns: string;
  os: string;
  team: string;
  vulns: number;
  maxAge: number;
  crit: number;
};

export const overviewQueryOptions = (team: string, tagFilter?: TagFilter | undefined) =>
  queryOptions({
    queryKey: ["overview", team, tagFilter],
    queryFn: () => fetchTeamData({ data: { team, tagFilter } }),
  });

export const overviewAllQueryOptions = (tagFilter?: TagFilter | undefined) =>
  queryOptions({
    queryKey: ["overview-all", tagFilter],
    queryFn: () => fetchOverview({ data: { tagFilter } }),
  });

export const squadsQueryOptions = () =>
  queryOptions({
    queryKey: ["squads"],
    queryFn: () => fetchAllTeamsData({}),
  });

export const slaQueryOptions = () =>
  queryOptions({
    queryKey: ["sla"],
    queryFn: () => fetchAllTeamsData({}),
  });

export const qidsQueryOptions = (filters: {
  sev?: string[];
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
}) =>
  queryOptions({
    queryKey: ["qids", filters],
    queryFn: () => fetchQids({ data: filters }),
  });

export const assetsQueryOptions = (filters: {
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
}) =>
  queryOptions({
    queryKey: ["assets", filters],
    queryFn: () => fetchAssets({ data: filters }),
  });

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

export const hardeningQueryOptions = () =>
  queryOptions({
    queryKey: ["hardening"],
    queryFn: () => fetchHardening({}),
  });

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

export type ReportTeamRow = {
  team: string;
  assets: number;
  vulns: number;
  critical: number;
  compliancePct: number;
};

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

export type ReportData = {
  kpis: ReportKpis;
  osRows: ReportOsRow[];
  topQids: ReportTopQid[];
  categories: ReportCategory[];
  assets: ReportAsset[];
  teamRows: ReportTeamRow[];
};

export const reportsQueryOptions = (filters: {
  team?: string | undefined;
  os?: string | undefined;
  tagFilter?: TagFilter | undefined;
}) =>
  queryOptions({
    queryKey: ["reports", filters],
    queryFn: () => fetchReports({ data: filters }),
  });

export const vulnerabilityStatsQueryOptions = (filters: {
  team?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
  q?: string;
}) =>
  queryOptions({
    queryKey: ["vulnerability-stats", filters],
    queryFn: () => fetchVulnerabilityStats({ data: filters }),
  });

export type LastSync = {
  lastRefresh: string | null;
  viewsCount: number;
};

export const lastSyncQueryOptions = () =>
  queryOptions({
    queryKey: ["last-sync"],
    queryFn: () => fetchLastSync({}),
  });
