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
import { fmt, severityOrder, severityToken, teamNames, teams } from "@/lib/sla-data";


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
  const [openSev, setOpenSev] = useState<string | null>("Crítica");
  const data = teams[team]!;

  const goToVulns = (extra: { sev?: string; q?: string } = {}) =>
    navigate({
      to: "/vulnerabilidades",
      search: { team, sev: extra.sev, q: extra.q },
    });


  const sevData = useMemo(
    () => severityOrder.map((s, i) => ({ name: s, total: data.chartSev[i] ?? 0 })),
    [data],
  );

  const slaChart = useMemo(
    () =>
      Object.entries(data.slaData).map(([sev, b]) => ({
        name: sev,
        "Dentro SLA": b.DentroSLA_Corr + b.DentroSLA_NaoCorr,
        "Fora SLA": b.ForaSLA_Corr + b.ForaSLA_NaoCorr,
      })),
    [data],
  );

  const totalSla = slaChart.reduce((a, r) => a + r["Dentro SLA"] + r["Fora SLA"], 0);
  const dentro = slaChart.reduce((a, r) => a + r["Dentro SLA"], 0);
  const aderencia = totalSla ? Math.round((dentro / totalSla) * 100) : 0;

  return (
    <Shell
      title="Visão geral"
      subtitle="Comparativo semanal — Semana 2 vs Semana 3 de Julho // base consolidada Qualys"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Seleção de squad">
          {teamNames.map((t) => (
            <button
              key={t}
              onClick={() => setTeam(t)}
              className={`stencil border-2 px-4 py-2 text-[11px] transition-transform ${
                t === team
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="flex gap-3">
          <div className="slab-signal px-4 py-2 text-center">
            <p className="font-display text-2xl leading-none font-bold text-primary">
              {data.kpis.qds}
            </p>
            <p className="stencil text-[9px] text-muted-foreground">Score QDS</p>
            <TrendTag trend={data.trends["qds"]} />
          </div>
          <div className="slab px-4 py-2 text-center">
            <p className="font-display text-2xl leading-none font-bold">{data.kpis.qds_corr}</p>
            <p className="stencil text-[9px] text-muted-foreground">QDS corrigíveis</p>
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
              <div key={sev} className="border-2 border-border">
                <button
                  onClick={() => setOpenSev(open ? null : sev)}
                  className="flex w-full items-center justify-between gap-4 bg-secondary px-4 py-3 text-left hover:bg-steel"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="inline-block h-4 w-4"
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

                {open && (
                  <div className="overflow-x-auto p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b-2 border-border">
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
                          <tr key={name} className="border-b border-border/60">
                            <td className="px-2 py-2">{name}</td>
                            <td className="px-2 py-2 text-right font-bold">{fmt(a.total)}</td>
                            <td className="px-2 py-2 text-right text-muted-foreground">{a.qids}</td>
                            <td
                              className={`px-2 py-2 text-right ${a.avg_age > 180 ? "text-critica" : "text-muted-foreground"}`}
                            >
                              {a.avg_age}d
                            </td>
                            <td className="w-[28%] px-2 py-2">
                              <div className="h-3 w-full bg-steel">
                                <div
                                  className="h-3"
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
