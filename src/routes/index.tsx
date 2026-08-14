import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "@/components/Shell";
import { StatSlab, TrendTag } from "@/components/StatSlab";
import { useQuery } from "@tanstack/react-query";
import { fmt, severityOrder, severityToken, teamNames, overviewQueryOptions } from "@/lib/sla-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Natura SecOps — Plataforma de Gestão de Vulnerabilidades" },
      {
        name: "description",
        content:
          "Plataforma interna Natura SecOps: score QDS, severidade, aderência a SLA e frentes de correção por squad de segurança.",
      },
      { property: "og:title", content: "Natura SecOps — Plataforma de Vulnerabilidades" },
      {
        property: "og:description",
        content: "Visão geral tática: KPIs, severidade, SLA e frentes de correção por squad.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const navigate = useNavigate();
  const [team, setTeam] = useState(teamNames[0] as string);
  const [teamOpen, setTeamOpen] = useState(false);
  const [openSev, setOpenSev] = useState<string | null>("Crítica");
  const { data, isLoading, isError } = useQuery(overviewQueryOptions(team));

  const goToVulns = (extra: { sev?: string; q?: string } = {}) =>
    navigate({
      to: "/vulnerabilidades",
      search: { team, sev: extra.sev, q: extra.q },
    });

  const sevData = useMemo(
    () => severityOrder.map((s, i) => ({ name: s, total: data?.chartSev[i] ?? 0 })),
    [data],
  );

  const slaChart = useMemo(
    () =>
      Object.entries(data?.slaData ?? {}).map(([sev, b]) => ({
        name: sev,
        "Dentro SLA": b.DentroSLA_Corr + b.DentroSLA_NaoCorr,
        "Fora SLA": b.ForaSLA_Corr + b.ForaSLA_NaoCorr,
      })),
    [data],
  );

  const totalSla = slaChart.reduce((a, r) => a + r["Dentro SLA"] + r["Fora SLA"], 0);
  const dentro = slaChart.reduce((a, r) => a + r["Dentro SLA"], 0);
  const aderencia = totalSla ? Math.round((dentro / totalSla) * 100) : 0;

  if (isLoading || !data)
    return (
      <Shell title="Visão geral" subtitle="Carregando base Qualys…">
        <OverviewSkeleton />
      </Shell>
    );
  if (isError)
    return (
      <Shell title="Visão geral" subtitle="Erro de conexão">
        <ErrorState />
      </Shell>
    );

  return (
    <Shell
      title="Visão geral"
      subtitle="Comparativo semanal — Semana 2 vs Semana 3 de Julho // base consolidada Qualys"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Squad selector + context panel */}
        <div className="slab corner-cut flex flex-col p-4 sm:col-span-2 lg:col-span-1">
          <p className="stencil text-[10px] text-muted-foreground">Squad ativo</p>
          <Popover open={teamOpen} onOpenChange={setTeamOpen}>
            <PopoverTrigger asChild>
              <button
                className="stencil mt-3 flex w-full items-center justify-between gap-2 border border-border bg-card px-4 py-2.5 text-[11px] text-muted-foreground transition-transform hover:-translate-y-0.5 hover:border-primary hover:text-foreground"
                aria-label="Selecionar squad"
              >
                <span className="flex items-center gap-2">
                  <span>Squad</span>
                  <span className="text-primary">{team}</span>
                </span>
                <ChevronsUpDown className="h-3 w-3 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0" align="start" sideOffset={6}>
              <Command>
                <CommandInput placeholder="Buscar squad..." className="font-mono text-xs" />
                <CommandList className="max-h-[280px]">
                  <CommandEmpty className="stencil py-4 text-center text-[10px] text-muted-foreground">
                    Nenhum squad encontrado
                  </CommandEmpty>
                  <CommandGroup>
                    {teamNames.map((t) => (
                      <CommandItem
                        key={t}
                        value={t}
                        onSelect={() => {
                          setTeam(t);
                          setTeamOpen(false);
                        }}
                        className="stencil gap-2 text-[11px] data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground"
                      >
                        <Check
                          className={cn("h-3.5 w-3.5", team === t ? "opacity-100" : "opacity-0")}
                        />
                        {t}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="mt-auto flex items-center gap-3 border-t border-border pt-3">
            <span className="font-display text-3xl leading-none font-bold text-primary">
              {String(teamNames.indexOf(team) + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="stencil text-[9px] text-muted-foreground">
                de {teamNames.length} squads
              </span>
              <span className="stencil text-[9px] text-muted-foreground">base Qualys</span>
            </div>
          </div>
        </div>

        {/* QDS Score */}
        <div className="slab-signal corner-cut flex flex-col p-4">
          <p className="stencil text-[10px] text-muted-foreground">Score QDS</p>
          <p className="mt-2 font-display text-4xl leading-none font-bold text-primary">
            {data.kpis.qds}
          </p>
          <div className="mt-auto pt-2">
            <TrendTag trend={data.trends["qds"]} />
          </div>
        </div>

        {/* QDS Corrigíveis */}
        <div className="slab corner-cut flex flex-col p-4">
          <p className="stencil text-[10px] text-muted-foreground">QDS corrigíveis</p>
          <p className="mt-2 font-display text-4xl leading-none font-bold">{data.kpis.qds_corr}</p>
          <div className="mt-auto pt-2">
            <TrendTag trend={data.trends["qds_corr"]} />
          </div>
        </div>
      </div>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatSlab
          label="Vulnerabilidades"
          value={data.kpis.vulns}
          trend={data.trends["vulns"]}
          accent
          action="abrir inventário"
          onClick={() => goToVulns()}
          sub={
            <>
              <span className="text-baixa">Corr: {fmt(data.kpis.vulns_corr)}</span>{" "}
              <span className="text-critica">/ Não corr: {fmt(data.kpis.vulns_nao_corr)}</span>
            </>
          }
        />
        <StatSlab
          label="QIDs únicos"
          value={data.kpis.qids}
          trend={data.trends["qids"]}
          action="listar QIDs"
          onClick={() => goToVulns()}
        />
        <StatSlab
          label="Ativos distintos"
          value={data.kpis.assets}
          trend={data.trends["assets"]}
          action="ver ativos"
          onClick={() => navigate({ to: "/ativos" })}
        />
        <StatSlab
          label="Frentes ativas"
          value={data.kpis.workfronts}
          trend={data.trends["workfronts"]}
          action="ver frentes"
          onClick={() => setOpenSev("Crítica")}
        />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="slab corner-cut p-5">
          <h2 className="stencil mb-4 text-xs text-primary">Distribuição por severidade</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sevData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--steel)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "2px solid var(--primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" name="Vulnerabilidades">
                  {sevData.map((d) => (
                    <Cell key={d.name} fill={severityToken[d.name]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="slab corner-cut p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="stencil text-xs text-primary">Aderência a SLA</h2>
            <span className="font-display text-2xl font-bold text-primary">{aderencia}%</span>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaChart}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--steel)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "2px solid var(--primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <Bar dataKey="Dentro SLA" stackId="a" fill="var(--baixa)" />
                <Bar dataKey="Fora SLA" stackId="a" fill="var(--critica)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="slab p-6">
        <h2 className="stencil mb-1 text-sm">Leitura facilitada // frentes de ação</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Clique numa severidade para abrir as frentes de correção, volume e idade média das
          pendências.
        </p>

        <div className="space-y-3">
          {severityOrder.map((sev) => {
            const block = data.raw[sev];
            if (!block) return null;
            const open = openSev === sev;
            const actions = Object.entries(block.actions).sort((a, b) => b[1].total - a[1].total);
            return (
              <div key={sev} className="border border-border">
                <div className="flex items-stretch bg-secondary">
                  <button
                    onClick={() => setOpenSev(open ? null : sev)}
                    className="flex flex-1 items-center justify-between gap-4 px-4 py-3 text-left hover:bg-steel"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="inline-block h-4 w-4 rounded-full"
                        style={{ background: severityToken[sev] }}
                      />
                      <span className="stencil text-xs">{sev}</span>
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="font-display text-xl font-bold">{fmt(block.total)}</span>
                      <span className="stencil text-[10px] text-muted-foreground">
                        {actions.length} frentes
                      </span>
                      <span className="text-primary">{open ? "−" : "+"}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => goToVulns({ sev })}
                    className="stencil border-l border-border px-4 text-[10px] text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    QIDs →
                  </button>
                </div>

                {open && (
                  <div className="overflow-x-auto p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="stencil px-2 py-2 text-left text-[10px] text-muted-foreground">
                            Frente de ação
                          </th>
                          <th className="stencil px-2 py-2 text-right text-[10px] text-muted-foreground">
                            Vulns
                          </th>
                          <th className="stencil px-2 py-2 text-right text-[10px] text-muted-foreground">
                            QIDs
                          </th>
                          <th className="stencil px-2 py-2 text-right text-[10px] text-muted-foreground">
                            Idade média
                          </th>
                          <th className="stencil px-2 py-2 text-left text-[10px] text-muted-foreground">
                            Peso
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {actions.map(([name, a]) => (
                          <tr
                            key={name}
                            onClick={() => goToVulns({ sev, q: name })}
                            className="cursor-pointer border-b border-border/60 hover:bg-steel"
                          >
                            <td className="px-2 py-2">{name}</td>
                            <td className="px-2 py-2 text-right font-bold">{fmt(a.total)}</td>
                            <td className="px-2 py-2 text-right text-primary underline-offset-2 hover:underline">
                              {a.qids}
                            </td>

                            <td
                              className={`px-2 py-2 text-right ${a.avg_age > 180 ? "text-critica" : "text-muted-foreground"}`}
                            >
                              {a.avg_age}d
                            </td>
                            <td className="w-[28%] px-2 py-2">
                              <div className="h-3 w-full rounded-full bg-steel">
                                <div
                                  className="h-3 rounded-full"
                                  style={{
                                    width: `${Math.max(2, (a.total / block.total) * 100)}%`,
                                    background: severityToken[sev],
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="slab corner-cut bg-steel h-[120px] animate-pulse" />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="slab corner-cut bg-steel h-[300px] animate-pulse" />
        <div className="slab corner-cut bg-steel h-[300px] animate-pulse" />
      </section>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="slab corner-cut p-6 text-center">
      <h2 className="stencil text-sm text-critica">Erro ao carregar dados</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Não foi possível consultar a base Qualys.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 stencil border border-primary px-4 py-2 text-[10px] text-primary hover:bg-primary hover:text-primary-foreground"
      >
        Tentar novamente
      </button>
    </div>
  );
}
