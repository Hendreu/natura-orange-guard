import { Fragment, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shell } from "@/components/Shell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fmt, qidsQueryOptions, severityOrder, severityToken, teamNames } from "@/lib/sla-data";

type VulnSearch = {
  q?: string | undefined;
  sev?: string | undefined;
  team?: string | undefined;
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
};

export const Route = createFileRoute("/vulnerabilidades")({
  validateSearch: (search: Record<string, unknown>): VulnSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    sev: typeof search["sev"] === "string" ? search["sev"] : undefined,
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tagFilter:
      search["tagFilter"] === "full" ||
      search["tagFilter"] === "full-cloud" ||
      search["tagFilter"] === "full-on-premise"
        ? search["tagFilter"]
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
  const sev = search.sev ?? "Todas";
  const team = search.team ?? "Todas";
  const tagFilter = search.tagFilter ?? "full";
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
  } = useQuery(qidsQueryOptions({ sev, team, q: debouncedQ, tagFilter }));

  const activeFilters = [
    sev !== "Todas" ? { key: "sev" as const, label: `Sev: ${sev}` } : null,
    team !== "Todas" ? { key: "team" as const, label: `Squad: ${team}` } : null,
    q ? { key: "q" as const, label: `Busca: ${q}` } : null,
  ].filter(Boolean) as { key: keyof VulnSearch; label: string }[];

  return (
    <Shell
      title="Vulnerabilidades"
      subtitle="Inventário de QIDs consolidado — filtre por squad, severidade ou termo e abra a solução recomendada."
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
                placeholder="QID, título ou frente de ação..."
                className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <Filter
            label="Severidade"
            value={sev}
            onChange={(v) => setParam("sev", v)}
            options={["Todas", ...severityOrder]}
          />
          <Filter
            label="Squad"
            value={team}
            onChange={(v) => setParam("team", v)}
            options={["Todas", ...teamNames]}
          />
          <div className="ml-auto text-right">
            <p className="font-display text-2xl leading-none font-bold tabular-nums text-primary">
              {rows.length}
            </p>
            <p className="stencil text-[9px] text-muted-foreground">registros exibidos</p>
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
              onClick={() =>
                navigate({
                  search: () => ({
                    q: undefined,
                    sev: undefined,
                    team: undefined,
                    tagFilter: undefined,
                  }),
                })
              }
              className="stencil border border-border px-3 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {isError ? (
        <div className="slab corner-cut p-6 text-center">
          <h2 className="stencil text-sm text-critica">Erro ao carregar vulnerabilidades</h2>
          <p className="mt-2 text-xs text-muted-foreground">Falha na consulta à base Qualys.</p>
        </div>
      ) : (
        <div className="slab overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary">
                {["QID", "Título", "Squad", "Sev", "Vulns", "Idade", "Detalhes"].map((h) => (
                  <th
                    key={h}
                    className="stencil px-3 py-3 text-left text-[10px] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="h-6 w-full bg-steel animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center">
                    <p className="stencil text-sm text-muted-foreground">
                      Nenhum resultado para os filtros selecionados
                    </p>
                    <button
                      onClick={() =>
                        navigate({
                          search: () => ({
                            q: undefined,
                            sev: undefined,
                            team: undefined,
                            tagFilter: undefined,
                          }),
                        })
                      }
                      className="stencil mt-3 border border-border px-4 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      Limpar filtros
                    </button>
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
                      <td className="px-3 py-2 font-bold">{fmt(r.count)}</td>
                      <td
                        className={`px-3 py-2 ${r.age > 180 ? "text-critica" : "text-muted-foreground"}`}
                      >
                        {r.age}d
                      </td>
                      <td className="px-3 py-2 text-primary">
                        {open === r.qid ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                    </tr>
                    {open === r.qid && (
                      <tr className="border-b border-border">
                        <td colSpan={7} className="bg-secondary px-5 py-4">
                          <p className="stencil mb-2 text-[10px] text-primary">
                            Frente: {r.action} — corrigíveis {fmt(r.corr)} / não corrigíveis{" "}
                            {fmt(r.naoCorr)}
                          </p>
                          <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                            {r.solution || "Sem solução registrada na base."}
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
      )}
    </Shell>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="min-w-[150px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
