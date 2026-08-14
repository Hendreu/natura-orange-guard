import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Cloud, Shield, AlertTriangle, List } from "lucide-react";
import { Shell } from "@/components/Shell";
import { fmt, hardeningQueryOptions, severityToken } from "@/lib/sla-data";

export const Route = createFileRoute("/hardening")({
  head: () => ({
    meta: [
      { title: "Hardening & Cloud Posture — Natura SecOps" },
      {
        name: "description",
        content:
          "Postura de segurança da nuvem: score de hardening, ativos cloud, prioridades de correção e top vulnerabilidades.",
      },
      { property: "og:title", content: "Hardening & Cloud Posture — Natura SecOps" },
      {
        property: "og:description",
        content:
          "Visão tática de hardening e postura cloud: score, ativos expostos e ações prioritárias.",
      },
    ],
  }),
  component: Hardening,
});

function Hardening() {
  const { data, isLoading, isError } = useQuery(hardeningQueryOptions());

  if (isLoading || !data) {
    return (
      <Shell
        title="Hardening & Cloud Posture"
        subtitle="Postura de segurança dos ativos cloud — score e prioridades de hardening."
      >
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="slab corner-cut bg-steel h-[120px] animate-pulse" />
          ))}
        </div>
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="slab corner-cut bg-steel h-[320px] animate-pulse" />
          <div className="slab corner-cut bg-steel h-[320px] animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell
        title="Hardening & Cloud Posture"
        subtitle="Postura de segurança dos ativos cloud — score e prioridades de hardening."
      >
        <div className="slab corner-cut p-6 text-center">
          <h2 className="stencil text-sm text-critica">Erro ao carregar postura cloud</h2>
          <p className="mt-2 text-xs text-muted-foreground">Falha na consulta à base Qualys.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Hardening & Cloud Posture"
      subtitle="Postura de segurança dos ativos cloud — score e prioridades de hardening."
    >
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="slab-signal px-4 py-3 text-center">
          <p className="font-display text-3xl leading-none font-bold text-primary">{data.score}%</p>
          <p className="stencil mt-1 text-[9px] text-muted-foreground">Postura cloud</p>
        </div>
        <div className="slab px-4 py-3 text-center">
          <p className="font-display text-3xl leading-none font-bold">{fmt(data.cloudAssets)}</p>
          <p className="stencil mt-1 text-[9px] text-muted-foreground">Ativos cloud</p>
        </div>
        <div className="slab px-4 py-3 text-center">
          <p className="font-display text-3xl leading-none font-bold text-critica">
            {fmt(data.cloudAssetsWithCritical)}
          </p>
          <p className="stencil mt-1 text-[9px] text-muted-foreground">Com críticas</p>
        </div>
        <div className="slab px-4 py-3 text-center">
          <p className="font-display text-3xl leading-none font-bold">{fmt(data.cloudVulns)}</p>
          <p className="stencil mt-1 text-[9px] text-muted-foreground">Vulns cloud</p>
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="slab corner-cut p-5">
          <div className="mb-4 flex items-center gap-3">
            <Shield size={18} className="text-primary" />
            <h2 className="stencil text-xs text-primary">Top frentes de hardening</h2>
          </div>
          {data.categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma categoria encontrada.</p>
          ) : (
            <div className="space-y-3">
              {data.categories.map((c) => (
                <div key={`${c.name}-${c.sev}`} className="flex items-center gap-3">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: severityToken[c.sev] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{c.name}</p>
                  </div>
                  <span className="stencil text-xs font-bold">{fmt(c.count)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="slab corner-cut p-5">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-critica" />
            <h2 className="stencil text-xs text-primary">Top vulnerabilidades cloud</h2>
          </div>
          {data.topQids.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma vulnerabilidade encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="stencil px-2 py-2 text-left text-[10px] text-muted-foreground">
                      QID
                    </th>
                    <th className="stencil px-2 py-2 text-left text-[10px] text-muted-foreground">
                      Título
                    </th>
                    <th className="stencil px-2 py-2 text-left text-[10px] text-muted-foreground">
                      Sev
                    </th>
                    <th className="stencil px-2 py-2 text-right text-[10px] text-muted-foreground">
                      Vulns
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topQids.map((q) => (
                    <tr key={q.qid} className="border-b border-border/60">
                      <td className="px-2 py-2 font-bold text-primary">{q.qid}</td>
                      <td className="max-w-[240px] truncate px-2 py-2" title={q.title}>
                        {q.title}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="stencil px-2 py-1 text-[9px] text-background"
                          style={{ background: severityToken[q.sev] }}
                        >
                          {q.sev}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-bold">{fmt(q.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="slab corner-cut p-5">
        <div className="mb-4 flex items-center gap-3">
          <List size={18} className="text-baixa" />
          <h2 className="stencil text-xs text-primary">Resumo executivo</h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {data.score >= 80
            ? "Postura cloud estável: a maioria dos ativos cloud não apresenta vulnerabilidades críticas."
            : data.score >= 50
              ? "Postura cloud precisa de atenção: parte significativa dos ativos cloud possui vulnerabilidades críticas."
              : "Postura cloud crítica: concentração alta de ativos cloud com vulnerabilidades severas."}{" "}
          {data.cloudAssets > 0 &&
            `${Math.round((data.cloudAssetsWithCritical / data.cloudAssets) * 100)}% dos ativos cloud possuem ao menos uma vulnerabilidade crítica.`}
        </p>
      </section>
    </Shell>
  );
}
