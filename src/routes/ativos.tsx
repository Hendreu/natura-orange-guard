import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shell } from "@/components/Shell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { assetsQueryOptions, fmt, teamNames } from "@/lib/sla-data";

type AtivosSearch = {
  q?: string | undefined;
  team?: string | undefined;
  tagFilter?: "all" | "all_clouds" | "all_onpremises";
};

export const Route = createFileRoute("/ativos")({
  validateSearch: (search: Record<string, unknown>): AtivosSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tagFilter:
      search["tagFilter"] === "all" ||
      search["tagFilter"] === "all_clouds" ||
      search["tagFilter"] === "all_onpremises"
        ? search["tagFilter"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ativos — Natura SecOps" },
      {
        name: "description",
        content:
          "Inventário de ativos expostos: IP, DNS, sistema operacional, volume de vulnerabilidades e idade máxima da pendência.",
      },
      { property: "og:title", content: "Ativos — Natura SecOps" },
      {
        property: "og:description",
        content: "Ranking de ativos por exposição, com filtro por squad e busca por IP/DNS/SO.",
      },
    ],
  }),
  component: Ativos,
});

function Ativos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/ativos" });
  const q = search.q ?? "";
  const team = search.team ?? "Todas";
  const tagFilter = search.tagFilter ?? "all";
  const [qInput, setQInput] = useState(q);
  const debouncedQ = useDebouncedValue(qInput, 300);

  const setParam = (key: keyof AtivosSearch, value: string) =>
    navigate({
      search: (prev: AtivosSearch) => ({
        ...prev,
        [key]: value && value !== "Todas" ? value : undefined,
      }),
    });

  // Sync input when URL changes externally (back/forward)
  useEffect(() => {
    if (q !== qInput && debouncedQ === qInput) {
      setQInput(q);
    }
  }, [q, qInput, debouncedQ]);

  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery(assetsQueryOptions({ team, q: debouncedQ, tagFilter }));

  const max = rows[0]?.vulns ?? 1;

  const activeFilters = [
    team !== "Todas" ? { key: "team" as const, label: `Squad: ${team}` } : null,
    q ? { key: "q" as const, label: `Busca: ${q}` } : null,
  ].filter(Boolean) as { key: keyof AtivosSearch; label: string }[];

  return (
    <Shell
      title="Ativos"
      subtitle="Superfície exposta por máquina — ordenada por volume de vulnerabilidades acumuladas."
    >
      <div className="slab mb-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="IP, DNS ou sistema operacional..."
                className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="min-w-[150px]">
            <span className="stencil mb-2 block text-[10px] text-muted-foreground">Squad</span>
            <Select value={team} onValueChange={(v) => setParam("team", v)}>
              <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Todas", ...teamNames].map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-right">
            <p className="font-display text-2xl leading-none font-bold tabular-nums text-primary">
              {rows.length}
            </p>
            <p className="stencil text-[9px] text-muted-foreground">ativos listados</p>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="stencil text-[10px] text-muted-foreground">Filtros ativos:</span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setParam(f.key, "")}
                className="stencil flex items-center gap-1.5 border border-primary px-3 py-1 text-[10px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {f.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              onClick={() => navigate({ search: () => ({ q: undefined, team: undefined, tagFilter: undefined }) })}
              className="stencil border border-border px-3 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {isError ? (
        <div className="slab corner-cut p-6 text-center">
          <h2 className="stencil text-sm text-critica">Erro ao carregar ativos</h2>
          <p className="mt-2 text-xs text-muted-foreground">Falha na consulta à base Qualys.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <article key={i} className="slab corner-cut p-4 animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="h-5 w-32 bg-steel" />
                    <div className="mt-2 h-3 w-48 bg-steel" />
                  </div>
                  <div className="h-5 w-16 bg-steel" />
                </div>
                <div className="mt-3 h-3 w-40 bg-steel" />
                <div className="mt-3 h-3 w-full bg-steel" />
                <div className="mt-3 flex justify-between">
                  <div className="h-4 w-16 bg-steel" />
                  <div className="h-4 w-16 bg-steel" />
                  <div className="h-4 w-10 bg-steel" />
                </div>
              </article>
            ))}
          {!isLoading && rows.length === 0 && (
            <div className="slab corner-cut col-span-full p-8 text-center">
              <p className="stencil text-sm text-muted-foreground">
                Nenhum resultado para os filtros selecionados
              </p>
              <button
                onClick={() => navigate({ search: () => ({ q: undefined, team: undefined, tagFilter: undefined }) })}
                className="stencil mt-3 border border-border px-4 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                Limpar filtros
              </button>
            </div>
          )}
          {rows.map((a) => (
            <article key={`${a.ip}-${a.team}`} className="slab corner-cut p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-none font-bold text-primary">{a.ip}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{a.dns}</p>
                </div>
                <span className="stencil border border-border px-2 py-1 text-[9px] text-muted-foreground">
                  {a.team}
                </span>
              </div>
              <p className="mt-3 truncate text-[11px] text-muted-foreground">{a.os}</p>
              <div className="mt-3 h-3 w-full bg-steel">
                <div
                  className="h-3 bg-primary"
                  style={{ width: `${Math.max(3, (a.vulns / max) * 100)}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-[11px]">
                <span>
                  <strong className="font-display text-base">{fmt(a.vulns)}</strong> vulns
                </span>
                <span className={a.crit ? "text-critica" : "text-muted-foreground"}>
                  {a.crit} críticas
                </span>
                <span className={a.maxAge > 365 ? "text-critica" : "text-muted-foreground"}>
                  {a.maxAge}d
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </Shell>
  );
}
