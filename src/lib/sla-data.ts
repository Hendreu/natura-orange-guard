import raw from "@/data/teams.json";

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

export const teams = raw as unknown as Record<string, TeamData>;
export const teamNames = Object.keys(teams);

export const severityOrder = ["Crítica", "Alta", "Média", "Baixa"] as const;
export type Severity = (typeof severityOrder)[number];

export const severityToken: Record<string, string> = {
  Crítica: "var(--critica)",
  Alta: "var(--alta)",
  Média: "var(--media)",
  Baixa: "var(--baixa)",
};

export function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

import qidsJson from "@/data/qids.json";
import assetsJson from "@/data/assets.json";

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

export const qids = qidsJson as QidRow[];
export const assets = assetsJson as AssetRow[];
