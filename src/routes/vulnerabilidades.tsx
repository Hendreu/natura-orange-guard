import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shell } from "@/components/Shell";
import { StatSlab } from "@/components/StatSlab";
import { FilterChip } from "@/components/FilterChip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  fmt,
  qidsQueryOptions,
  vulnerabilityStatsQueryOptions,
  severityToken,
  teamNames,
} from "@/lib/sla-data";

type VulnSearch = {
  q?: string | undefined;
  sev?: string[] | undefined;
  team?: string | undefined;
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
};

const parseArray = (value: unknown): string[] | undefined => {
  if (typeof value === "string" && value) return value.split(",");
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return undefined;
};

const statusLabel: Record<string, string> = {
  Active: "Ativa",
  New: "Nova",
  "Re-Opened": "Reaberta",
  Fixed: "Corrigida",
};

const defaultStatuses = ["Active", "New", "Re-Opened"];

export const Route = createFileRoute("/vulnerabilidades")({
  validateSearch: (search: Record<string, unknown>): VulnSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    sev: parseArray(search["sev"]),
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tagFilter:
      search["tagFilter"] === "full" ||
      search["tagFilter"] === "full-cloud" ||
      search["tagFilter"] === "full-on-premise"
        ? search["tagFilter"]
        : undefined,
    categories: parseArray(search["categories"]),
    statuses: parseArray(search["statuses"]),
  }),
  head: () => ({
    meta: [
      { title: "Vulnerabilidades — Natura SecOps" },
      {
        name: "description",
        content:
          "Inventário de QIDs por squad, severidade e idade: busca, filtros e plano de remediação sugerido.",
      },
      { property: "og:title", content: "Vulnerabilidades — Natura SecOps" },
      {
        property: "og:description",
        content: "Busque QIDs por título, squad ou frente de ação e leia a solução recomendada.",
      },
    ],
  }),
  component: Vulnerabilidades,
});

function Vulnerabilidades() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/vulnerabilidades" });
  const q = search.q ?? "";
  const team = search.team ?? "Todas";
  const tagFilter = search.tagFilter ?? "full";
  const selectedSevs = useMemo(() => search.sev ?? [], [search.sev]);
  const categories = useMemo(() => search.categories ?? [], [search.categories]);
  const statuses = useMemo(() => search.statuses ?? defaultStatuses, [search.statuses]);
  const [open, setOpen] = useState<number | null>(null);
  const [qInput, setQInput] = useState(q);
  const debouncedQ = useDebouncedValue(qInput, 300);

  const setParam = (key: keyof VulnSearch, value: string) =>
    navigate({
      search: (prev: VulnSearch) => ({
        ...prev,
        [key]: value && value !== "Todas" ? value : undefined,
      }),
    });

  const setCategories = (values: string[]) =>
    navigate({
      search: (prev: VulnSearch) => ({
        ...prev,
        categories: values.length ? values : undefined,
      }),
    });

  const setStatuses = (values: string[]) =>
    navigate({
      search: (prev: VulnSearch) => ({
        ...prev,
        statuses: values.length ? values : undefined,
      }),
    });

  const setSeverities = (values: string[]) =>
    navigate({
      search: (prev: VulnSearch) => ({
        ...prev,
        sev: values.length ? values : undefined,
      }),
    });

  // Sync input when URL changes externally (back/forward)
  useEffect(() => {
    if (q !== qInput && debouncedQ === qInput) {
      setQInput(q);
    }
  }, [q, qInput, debouncedQ]);

  useEffect(() => {
    if (debouncedQ !== q) {
      navigate({
        search: (prev: VulnSearch) => ({
          ...prev,
          q: debouncedQ || undefined,
        }),
      });
    }
  }, [debouncedQ, q, navigate]);

  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery(
    qidsQueryOptions({ sev: selectedSevs, team, q: debouncedQ, tagFilter, categories, statuses }),
  );

  const { data: stats, isLoading: statsLoading } = useQuery(
    vulnerabilityStatsQueryOptions({ team, tagFilter, categories, statuses, q: debouncedQ }),
  );

  const severityOptions = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.bySeverityNumber)
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const filteredTotal = useMemo(() => {
    if (!stats) return 0;
    if (selectedSevs.length === 0) return stats.total;
    return selectedSevs.reduce((sum, s) => sum + (stats.bySeverityNumber[s] ?? 0), 0);
  }, [stats, selectedSevs]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      map.set(r.action, (map.get(r.action) ?? 0) + r.count);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const statusOptions = useMemo(
    () =>
      ["Active", "New", "Re-Opened", "Fixed"].map((value) => ({
        value,
        label: statusLabel[value] ?? value,
        count: rows.filter((r) => r.status === value).reduce((a, r) => a + r.count, 0),
      })),
    [rows],
  );

  const activeFilters = useMemo(() => {
    const filters: { key: string; param: keyof VulnSearch; value: string; label: string }[] = [];
    selectedSevs.forEach((s) =>
      filters.push({ key: `sev-${s}`, param: "sev", value: s, label: s }),
    );
    if (team && team !== "Todas") {
      filters.push({ key: `team-${team}`, param: "team", value: "", label: team });
    }
    categories.forEach((c) =>
      filters.push({ key: `cat-${c}`, param: "categories", value: c, label: c }),
    );
    const statusDefault =
      statuses.length === defaultStatuses.length &&
      defaultStatuses.every((s) => statuses.includes(s));
    if (!statusDefault) {
      statuses.forEach((s) =>
        filters.push({
          key: `status-${s}`,
          param: "statuses",
          value: s,
          label: statusLabel[s] ?? s,
        }),
      );
    }
    return filters;
  }, [selectedSevs, team, categories, statuses]);

  return (
    <Shell
      title="Vulnerabilidades"
      subtitle="Visão operacional de vulnerabilidades — filtros por severidade, categoria e status."
    >
      <section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatSlab label="Total Detections" value={filteredTotal} accent className="lg:col-span-2" />
        <StatSlab label="CISA KEV" value={stats?.cisaKev ?? 0} />
        <StatSlab label="Ransomware Vulns" value={stats?.ransomware ?? 0} />
        <StatSlab label="Critical Patchable Vulns" value={stats?.criticalPatchable ?? 0} />
        <StatSlab label="Critical Vulns (QID)" value={stats?.critical ?? 0} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="slab space-y-6 p-4">
          <div>
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="QID, título ou categoria..."
                className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Squad</span>
            <Select value={team} onValueChange={(v) => setParam("team", v)}>
              <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Todas", "All Cloud", "All On-Prem", ...teamNames].map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Severidade</span>
            <div className="space-y-1">
              {severityOptions.map(({ level, count }) => {
                const active = selectedSevs.includes(level);
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const next = active
                        ? selectedSevs.filter((v) => v !== level)
                        : [...selectedSevs, level];
                      setSeverities(next);
                    }}
                    className={`flex w-full items-center justify-between rounded-sm border px-2 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}
                  >
                    <span className="font-bold">Nível {level}</span>
                    <span className="stencil">{fmt(count)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Categoria</span>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map(({ value, count }) => {
                const active = categories.includes(value);
                return (
                  <FilterChip
                    key={value}
                    label={value}
                    count={count}
                    active={active}
                    onClick={() => {
                      const next = active
                        ? categories.filter((c) => c !== value)
                        : [...categories, value];
                      setCategories(next);
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Status</span>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(({ value, label, count }) => {
                const active = statuses.includes(value);
                return (
                  <FilterChip
                    key={value}
                    label={label}
                    count={count}
                    active={active}
                    onClick={() => {
                      const next = active
                        ? statuses.filter((s) => s !== value)
                        : [...statuses, value];
                      setStatuses(next);
                    }}
                  />
                );
              })}
            </div>
          </div>

          <button
            onClick={() =>
              navigate({
                search: () => ({
                  q: undefined,
                  sev: undefined,
                  team: undefined,
                  tagFilter: undefined,
                  categories: undefined,
                  statuses: undefined,
                }),
              })
            }
            className="stencil w-full border border-border px-3 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Limpar tudo
          </button>
        </aside>

        <div className="slab overflow-x-auto">
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <span className="stencil text-[10px] text-muted-foreground">Filtros:</span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    if (f.param === "categories")
                      setCategories(categories.filter((c) => c !== f.value));
                    if (f.param === "statuses") setStatuses(statuses.filter((s) => s !== f.value));
                    if (f.param === "sev") setSeverities(selectedSevs.filter((s) => s !== f.value));
                    if (f.param === "team") setParam("team", "");
                  }}
                  className="stencil inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] text-foreground hover:border-primary"
                >
                  {f.label}
                  <span className="text-muted-foreground">×</span>
                </button>
              ))}
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary">
                {["QID", "Título", "Squad", "Sev", "Status", "Vulns", "Idade", "Solução"].map(
                  (h) => (
                    <th
                      key={h}
                      className="stencil px-3 py-3 text-left text-[10px] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading || statsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={8} className="px-3 py-2">
                      <div className="h-6 w-full animate-pulse bg-steel" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center">
                    <p className="stencil text-sm text-critica">
                      Erro ao carregar vulnerabilidades
                    </p>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center">
                    <p className="stencil text-sm text-muted-foreground">Nenhum resultado</p>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <Fragment key={`${r.qid}-${r.team}-${r.action}`}>
                    <tr
                      onClick={() => setOpen(open === r.qid ? null : r.qid)}
                      className="cursor-pointer border-b border-border/60 hover:bg-steel"
                    >
                      <td className="px-3 py-2 font-bold text-primary">{r.qid}</td>
                      <td className="max-w-[420px] truncate px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.team}</td>
                      <td className="px-3 py-2">
                        <span
                          className="stencil px-2 py-1 text-[9px] text-background"
                          style={{ background: severityToken[r.sev] }}
                        >
                          {r.sev}
                        </span>
                      </td>
                      <td className="px-3 py-2">{statusLabel[r.status] ?? r.status}</td>
                      <td className="px-3 py-2 font-bold">{fmt(r.count)}</td>
                      <td
                        className={`px-3 py-2 ${r.age > 180 ? "text-critica" : "text-muted-foreground"}`}
                      >
                        {r.age}d
                      </td>
                      <td className="px-3 py-2">{r.solution ? "Sim" : "—"}</td>
                    </tr>
                    {open === r.qid && (
                      <tr className="border-b border-border">
                        <td colSpan={8} className="bg-secondary px-5 py-4">
                          <p className="stencil mb-2 text-[10px] text-primary">
                            Frente: {r.action}
                          </p>
                          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                            {r.solution || "Sem solução registrada."}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
