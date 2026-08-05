import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "@/components/Shell";
import { fmt, teams, teamNames } from "@/lib/sla-data";

export const Route = createFileRoute("/sla")({
  head: () => ({
    meta: [
      { title: "SLA & Risco — Natura SecOps" },
      {
        name: "description",
        content:
          "Aderência a SLA por squad e severidade: volume dentro e fora do prazo, com ranking de risco acumulado.",
      },
      { property: "og:title", content: "SLA & Risco — Natura SecOps" },
      {
        property: "og:description",
        content: "Comparativo de aderência a SLA entre as squads de segurança da Natura.",
      },
    ],
  }),
  component: Sla,
});

function Sla() {
  const rows = teamNames.map((t) => {
    const d = teams[t]!;
    let dentro = 0;
    let fora = 0;
    Object.values(d.slaData).forEach((b) => {
      dentro += b.DentroSLA_Corr + b.DentroSLA_NaoCorr;
      fora += b.ForaSLA_Corr + b.ForaSLA_NaoCorr;
    });
    const total = dentro + fora || 1;
    return { name: t, dentro, fora, aderencia: Math.round((dentro / total) * 100) };
  });

  const chart = rows.map((r) => ({
    name: r.name,
    "Dentro SLA": r.dentro,
    "Fora SLA": r.fora,
  }));

  return (
    <Shell
      title="SLA & Risco"
      subtitle="Comparativo de aderência entre squads — quanto do backlog está dentro do prazo acordado."
    >
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((r) => (
          <Link
            key={r.name}
            to="/vulnerabilidades"
            search={{ team: r.name }}
            className={`${r.aderencia >= 80 ? "slab" : "slab-signal"} corner-cut tappable block p-4`}
          >
            <p className="stencil text-[10px] text-muted-foreground">{r.name}</p>
            <p
              className={`font-display text-4xl leading-none font-bold ${r.aderencia >= 80 ? "text-baixa" : "text-primary"}`}
            >
              {r.aderencia}%
            </p>
            <div className="mt-3 h-3 w-full bg-steel">
              <div className="h-3 bg-baixa" style={{ width: `${r.aderencia}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {fmt(r.fora)} fora do prazo / {fmt(r.dentro + r.fora)} total
            </p>
            <p className="stencil mt-2 text-[9px] text-primary">ver backlog →</p>
          </Link>
        ))}
      </section>


      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Volume dentro vs fora do SLA</h2>
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
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
      </section>
    </Shell>
  );
}
