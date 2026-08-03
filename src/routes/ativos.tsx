import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { assets, fmt, teamNames } from "@/lib/sla-data";

export const Route = createFileRoute("/ativos")({
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
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("Todas");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return assets
      .filter(
        (a) =>
          (team === "Todas" || a.team === team) &&
          (!term ||
            a.ip.includes(term) ||
            a.dns.toLowerCase().includes(term) ||
            a.os.toLowerCase().includes(term)),
      )
      .slice(0, 100);
  }, [q, team]);

  const max = rows[0]?.vulns ?? 1;

  return (
    <Shell
      title="Ativos"
      subtitle="Superfície exposta por máquina — ordenada por volume de vulnerabilidades acumuladas."
    >
      <div className="slab mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="min-w-[240px] flex-1">
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="IP, DNS ou sistema operacional..."
            className="w-full border-2 border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">Squad</span>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="border-2 border-border bg-input px-3 py-2 text-xs outline-none focus:border-primary"
          >
            {["Todas", ...teamNames].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto text-right">
          <p className="font-display text-2xl leading-none font-bold text-primary">{rows.length}</p>
          <p className="stencil text-[9px] text-muted-foreground">ativos listados</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((a) => (
          <article key={`${a.ip}-${a.team}`} className="slab corner-cut p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg leading-none font-bold text-primary">{a.ip}</p>
                <p className="truncate text-[11px] text-muted-foreground">{a.dns}</p>
              </div>
              <span className="stencil border-2 border-border px-2 py-1 text-[9px] text-muted-foreground">
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
    </Shell>
  );
}
