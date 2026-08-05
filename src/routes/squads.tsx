import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { StatSlab } from "@/components/StatSlab";
import { fmt, severityOrder, severityToken, teams, teamNames } from "@/lib/sla-data";

export const Route = createFileRoute("/squads")({
  head: () => ({
    meta: [
      { title: "Squads — Natura SecOps" },
      {
        name: "description",
        content:
          "Perfil de cada squad de segurança da Natura: score QDS, backlog, ativos sob gestão e mix de severidade.",
      },
      { property: "og:title", content: "Squads — Natura SecOps" },
      {
        property: "og:description",
        content: "Comparativo lado a lado das squads: QDS, backlog, ativos e severidade.",
      },
    ],
  }),
  component: Squads,
});

function Squads() {
  const totalVulns = teamNames.reduce((a, t) => a + teams[t]!.kpis.vulns, 0);
  const totalAssets = teamNames.reduce((a, t) => a + teams[t]!.kpis.assets, 0);
  const avgQds = Math.round(
    teamNames.reduce((a, t) => a + teams[t]!.kpis.qds, 0) / teamNames.length,
  );

  return (
    <Shell
      title="Squads"
      subtitle="Perfil operacional de cada frente da divisão de segurança — clique para abrir a visão geral."
    >
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatSlab label="Backlog total" value={totalVulns} accent />
        <StatSlab label="Ativos sob gestão" value={totalAssets} />
        <StatSlab label="QDS médio" value={avgQds} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {teamNames.map((t) => {
          const d = teams[t]!;
          const total = d.chartSev.reduce((a, b) => a + b, 0) || 1;
          return (
            <article key={t} className="slab corner-cut p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl leading-none font-bold">{t}</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {d.kpis.workfronts} frentes ativas / {fmt(d.kpis.qids)} QIDs únicos
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl leading-none font-bold text-primary">
                    {d.kpis.qds}
                  </p>
                  <p className="stencil text-[9px] text-muted-foreground">QDS</p>
                </div>
              </div>

              <div className="mt-4 flex h-4 w-full overflow-hidden">
                {severityOrder.map((s, i) => (
                  <div
                    key={s}
                    title={`${s}: ${d.chartSev[i] ?? 0}`}
                    style={{
                      width: `${((d.chartSev[i] ?? 0) / total) * 100}%`,
                      background: severityToken[s],
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                {severityOrder.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5" style={{ background: severityToken[s] }} />
                    {s} {fmt(d.chartSev[i] ?? 0)}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
                <div>
                  <p className="font-display text-xl font-bold">{fmt(d.kpis.vulns)}</p>
                  <p className="stencil text-[9px] text-muted-foreground">Vulns</p>
                </div>
                <div>
                  <p className="font-display text-xl font-bold">{fmt(d.kpis.assets)}</p>
                  <p className="stencil text-[9px] text-muted-foreground">Ativos</p>
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-critica">
                    {fmt(d.kpis.vulns_nao_corr)}
                  </p>
                  <p className="stencil text-[9px] text-muted-foreground">Não corr.</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/vulnerabilidades"
                  search={{ team: t }}
                  className="stencil border border-primary px-4 py-2 text-[10px] text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  Ver vulnerabilidades
                </Link>
                <Link
                  to="/vulnerabilidades"
                  search={{ team: t, sev: "Crítica" }}
                  className="stencil border border-critica px-4 py-2 text-[10px] text-critica hover:bg-critica hover:text-foreground"
                >
                  Só críticas
                </Link>
                <Link
                  to="/ativos"
                  className="stencil border border-border px-4 py-2 text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  Ativos
                </Link>
              </div>

            </article>
          );
        })}
      </div>
    </Shell>
  );
}
