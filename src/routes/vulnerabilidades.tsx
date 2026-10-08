import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { QidAssetList } from "@/components/QidAssetList";
import { SolutionContent } from "@/components/SolutionContent";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  fmt,
  qidsQueryOptions,
  vulnerabilityStatsQueryOptions,
  severityToken,
  teamNames,
} from "@/lib/sla-data";
import { TEAM_OPTIONS } from "@/lib/constants";
import { parseNumberArray } from "@/lib/search";
import { displayQidTitle } from "@/lib/qid-metadata";
import type { QidAssetsInput } from "@/lib/sla-data";

type VulnSearch = {
  q?: string | undefined;
  sev?: string[] | undefined;
  team?: string | undefined;
  tags?: number[] | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
  yearScope?: "current" | "slipped" | "all" | undefined;
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
    tags: parseNumberArray(search["tags"]),
    categories: parseArray(search["categories"]),
    statuses: parseArray(search["statuses"]),
    yearScope:
      search["yearScope"] === "current" || search["yearScope"] === "slipped" || search["yearScope"] === "all"
        ? search["yearScope"]
        : undefined,
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
  const tags = search.tags ?? [];
  const selectedSevs = useMemo(() => search.sev ?? [], [search.sev]);
  const categories = useMemo(() => search.categories ?? [], [search.categories]);
  const statuses = useMemo(() => search.statuses ?? defaultStatuses, [search.statuses]);
  const yearScope = search.yearScope ?? "current";

  // Draft state: edits happen locally until user clicks "Aplicar"
  const [draftTeam, setDraftTeam] = useState(team);
  const [draftSevs, setDraftSevs] = useState<string[]>(selectedSevs);
  const [draftCategories, setDraftCategories] = useState<string[]>(categories);
  const [draftStatuses, setDraftStatuses] = useState<string[]>(statuses);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<{
    readonly identity: string;
    readonly scope: string;
    readonly page: number;
  } | null>(null);
  const [qInput, setQInput] = useState(q);
  const debouncedQ = useDebouncedValue(qInput, 300);
  const filters: QidAssetsInput["filters"] = {
    team, sev: selectedSevs, q: debouncedQ, tags, categories, statuses, yearScope,
  };
  const filterScope = JSON.stringify(filters);

  useEffect(() => {
    setOpen(null);
  }, [filterScope]);

  // Sync draft when URL changes externally (back/forward, global filter, etc.)
  useEffect(() => {
    setDraftTeam(team);
    setDraftSevs(selectedSevs);
    setDraftCategories(categories);
    setDraftStatuses(statuses);
  }, [team, selectedSevs, categories, statuses]);

  // Sync input when URL changes externally
  useEffect(() => {
    if (q !== qInput && debouncedQ === qInput) {
      setQInput(q);
    }
  }, [q, qInput, debouncedQ]);

  // Search still debounces to URL
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

  const applyFilters = () => {
    navigate({
      search: (prev: VulnSearch) => ({
        ...prev,
        team: draftTeam === "Todas" ? undefined : draftTeam,
        sev: draftSevs.length ? draftSevs : undefined,
        categories: draftCategories.length ? draftCategories : undefined,
        statuses: draftStatuses.length ? draftStatuses : undefined,
      }),
    });
  };

  const clearFilters = () => {
    setDraftTeam("Todas");
    setDraftSevs([]);
    setDraftCategories([]);
    setDraftStatuses(defaultStatuses);
    navigate({
      search: (prev: VulnSearch) => ({
        q: undefined,
        sev: undefined,
        team: undefined,
        tags: undefined,
        categories: undefined,
        statuses: undefined,
        yearScope: prev.yearScope,
      }),
    });
  };

  const hasChanges =
    draftTeam !== team ||
    !arraysEqual(draftSevs, selectedSevs) ||
    !arraysEqual(draftCategories, categories) ||
    !arraysEqual(draftStatuses, statuses);

  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery(
    qidsQueryOptions(filters),
  );

  const { data: stats, isLoading: statsLoading } = useQuery(
    vulnerabilityStatsQueryOptions({ team, tags, categories, statuses, q: debouncedQ, yearScope }),
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
    return (stats?.byCategory ?? [])
      .map(({ category, count }) => ({ value: category, label: category, count }));
  }, [stats]);

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

      <div className="space-y-4">
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xl sm:flex-1">
              <label htmlFor="vulnerability-search" className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="vulnerability-search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="QID, título ou categoria..."
                  className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="w-full sm:w-auto">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filtros
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
            <DialogHeader className="shrink-0 border-b border-border p-4 pr-12 text-left">
              <DialogTitle>Filtros</DialogTitle>
              <DialogDescription>Selecione squad, severidade, categoria e status e aplique os filtros.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              <div>
                <span className="stencil mb-2 block text-[10px] text-muted-foreground">Squad</span>
                <Select value={draftTeam} onValueChange={(v) => setDraftTeam(v)}>
                  <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="stencil mb-2 block text-[10px] text-muted-foreground">Severidade</span>
                <div className="space-y-1">
                  {severityOptions.map(({ level, count }) => {
                    const active = draftSevs.includes(level);
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          const next = active
                            ? draftSevs.filter((v) => v !== level)
                            : [...draftSevs, level];
                          setDraftSevs(next);
                        }}
                        className={`flex w-full items-center justify-between rounded-sm border px-2 py-1.5 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    const active = draftCategories.includes(value);
                    return (
                      <FilterChip
                        key={value}
                        label={value}
                        count={count}
                        active={active}
                        onClick={() => {
                          const next = active
                            ? draftCategories.filter((c) => c !== value)
                            : [...draftCategories, value];
                          setDraftCategories(next);
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
                    const active = draftStatuses.includes(value);
                    return (
                      <FilterChip
                        key={value}
                        label={label}
                        count={count}
                        active={active}
                        onClick={() => {
                          const next = active
                            ? draftStatuses.filter((s) => s !== value)
                            : [...draftStatuses, value];
                          setDraftStatuses(next);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border bg-background p-4 sm:flex-col sm:space-x-0">
              <Button
                type="button"
                onClick={() => { applyFilters(); setFiltersOpen(false); }}
                disabled={!hasChanges}
                className="stencil w-full text-[10px]"
              >
                Aplicar filtros
              </Button>
              <Button type="button" variant="outline" onClick={clearFilters} className="stencil w-full text-[10px]">
                Limpar tudo
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="stencil w-full text-[10px]">
                  Cancelar
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="slab overflow-x-auto">
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <span className="stencil text-[10px] text-muted-foreground">Filtros:</span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    if (f.param === "categories")
                      navigate({
                        search: (prev: VulnSearch) => ({
                          ...prev,
                          categories: categories.filter((c) => c !== f.value) || undefined,
                        }),
                      });
                    if (f.param === "statuses")
                      navigate({
                        search: (prev: VulnSearch) => ({
                          ...prev,
                          statuses: statuses.filter((s) => s !== f.value) || undefined,
                        }),
                      });
                    if (f.param === "sev")
                      navigate({
                        search: (prev: VulnSearch) => ({
                          ...prev,
                          sev: selectedSevs.filter((s) => s !== f.value) || undefined,
                        }),
                      });
                    if (f.param === "team")
                      navigate({
                        search: (prev: VulnSearch) => ({ ...prev, team: undefined }),
                      });
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
                {["QID", "Título", "Squad", "Sev", "Status", "Detecções", "Idade", "Solução"].map(
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
                rows.map((r) => {
                  const identity = JSON.stringify([r.qid, r.team, r.action, r.sev]);
                  const expanded = open?.identity === identity && open.scope === filterScope;
                  const detailsId = `qid-details-${encodeURIComponent(identity)}`;
                  const toggle = () => setOpen((previous) =>
                    previous?.identity === identity && previous.scope === filterScope
                      ? null
                      : { identity, scope: filterScope, page: 1 },
                  );
                  return (
                  <Fragment key={identity}>
                    <tr
                      onClick={toggle}
                      className={`cursor-pointer border-b border-border/60 hover:bg-steel ${expanded ? "bg-steel" : ""}`}
                    >
                      <td className="px-3 py-2 font-bold text-primary">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={detailsId}
                          aria-label={`${expanded ? "Ocultar" : "Mostrar"} detalhes do QID ${r.qid}, ${r.team}, ${r.action}, ${r.sev}`}
                          onClick={(event) => { event.stopPropagation(); toggle(); }}
                          className="inline-flex items-center gap-1 rounded-sm p-1 hover:bg-primary/10 active:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {expanded ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                          {r.qid}
                        </button>
                      </td>
                      <td className="max-w-[420px] truncate px-3 py-2">
                        {displayQidTitle(r.title)}
                      </td>
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
                    {expanded && open && (
                      <tr className="border-b border-border">
                        <td colSpan={8} className="bg-muted px-5 py-4">
                          <div id={detailsId} className="space-y-4">
                            <QidAssetList
                              input={{
                                row: { qid: r.qid, team: r.team, action: r.action, sev: r.sev },
                                filters,
                                page: open.page,
                              }}
                              parentDetectionCount={r.count}
                              onPageChange={(page) => setOpen((previous) => previous ? { ...previous, page } : null)}
                            />
                            <div className="border-t border-border pt-4">
                              <h3 className="stencil mb-1 text-[11px] text-foreground">Frente de ação</h3>
                              <p className="text-xs text-muted-foreground">{r.action || "—"}</p>
                            </div>
                            <div>
                              <h3 className="stencil mb-2 text-[11px] text-foreground">Solução recomendada</h3>
                              <SolutionContent solution={r.solution} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}
