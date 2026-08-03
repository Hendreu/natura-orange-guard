import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { fmt, qids, severityOrder, severityToken, teamNames } from "@/lib/sla-data";

export const Route = createFileRoute("/vulnerabilidades")({
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
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<string>("Todas");
  const [team, setTeam] = useState<string>("Todas");
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return qids
      .filter(
        (r) =>
          (sev === "Todas" || r.sev === sev) &&
          (team === "Todas" || r.team === team) &&
          (!term ||
            r.title.toLowerCase().includes(term) ||
            r.action.toLowerCase().includes(term) ||
            String(r.qid).includes(term)),
      )
      .slice(0, 120);
  }, [q, sev, team]);

  return (
    <Shell
      title="Vulnerabilidades"
      subtitle="Inventário de QIDs consolidado — filtre por squad, severidade ou termo e abra a solução recomendada."
    >
      <div className="slab mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="flex-1 min-w-[220px]">
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="QID, título ou frente de ação..."
            className="w-full border-2 border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </label>
        <Filter label="Severidade" value={sev} onChange={setSev} options={["Todas", ...severityOrder]} />
        <Filter label="Squad" value={team} onChange={setTeam} options={["Todas", ...teamNames]} />
        <div className="ml-auto text-right">
          <p className="font-display text-2xl leading-none font-bold text-primary">{rows.length}</p>
          <p className="stencil text-[9px] text-muted-foreground">registros exibidos</p>
        </div>
      </div>

      <div className="slab overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-border bg-secondary">
              {["QID", "Título", "Squad", "Sev", "Vulns", "Idade", ""].map((h) => (
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
            {rows.map((r) => (
              <>
                <tr
                  key={`${r.qid}-${r.team}-${r.action}`}
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
                  <td className="px-3 py-2 text-primary">{open === r.qid ? "−" : "+"}</td>
                </tr>
                {open === r.qid && (
                  <tr key={`${r.qid}-detail`} className="border-b-2 border-border">
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
              </>
            ))}
          </tbody>
        </table>
      </div>
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
    <label>
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-2 border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
