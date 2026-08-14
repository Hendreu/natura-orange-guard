export const TEAM_NAMES = [
  "On-Prem",
  "Wintel",
  "Workstation",
  "Cloud",
  "Cloud-Middleware",
  "Unix",
  "Varejo-PDV",
  "Varejo",
  "Varejo-Deskservers",
  "Workstation-RPA",
  "Varejo-Notebooks",
  "Cloud-ETL",
  "Cloud-Observability",
  "Cloud-Unix",
  "Cloud-SAP",
  "EASM",
  "Gera-HML",
  "Gera",
  "Cloud-DBA",
  "Cloud-Wintel",
  "InfraCD",
  "Cloud-CMDB",
  "Cloud-Cyber",
  "Cloud-Backup",
  "Network",
  "Renee-Migração",
  "Middleware",
  "Cloud-IDAM",
  "Cloud-SRE",
  "Cloud-ZTNA",
  "Cloud-Pilares",
  "Cloud-Coedados",
  "Cloud-Network",
  "Cloud-Panorama",
  "Cloud-Modernops",
  "Cloud-Devops-COE",
] as const;

export const SEVERITY_ORDER = ["Crítica", "Alta", "Média", "Baixa"] as const;

export const SEV_TO_LABEL: Record<number, string> = {
  5: "Crítica",
  4: "Alta",
  3: "Média",
  2: "Baixa",
  1: "Baixa",
};

export const LABEL_TO_SEV: Record<string, number> = {
  Crítica: 5,
  Alta: 4,
  Média: 3,
  Baixa: 2,
};

export const SLA_THRESHOLDS: Record<string, number> = {
  Crítica: 15,
  Alta: 30,
  Média: 90,
  Baixa: 180,
};

export const ACTIVE_STATUSES = ["Active", "New", "Re-Opened"] as const;

export const TAG_FILTER_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "full-cloud", label: "All Clouds" },
  { value: "full-on-premise", label: "On-Prem" },
] as const;

export type TagFilter = (typeof TAG_FILTER_OPTIONS)[number]["value"];
