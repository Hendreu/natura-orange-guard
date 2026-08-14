import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  FileBarChart,
  LayoutDashboard,
  Monitor,
  Search,
  Server,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shell } from "@/components/Shell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  fmt,
  reportsQueryOptions,
  severityToken,
  teamNames,
  type ReportData,
} from "@/lib/sla-data";

type RelatoriosSearch = {
  team?: string | undefined;
  os?: string | undefined;
  q?: string | undefined;
};

export const Route = createFileRoute("/relatorios")({
  validateSearch: (search: Record<string, unknown>): RelatoriosSearch => ({
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    os: typeof search["os"] === "string" ? search["os"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Relatórios de Conformidade — Natura SecOps" },
      {
        name: "description",
        content:
          "Dashboard de conformidade: score por time e SO, pareto de controles falhos e inventário de ativos.",
      },
      { property: "og:title", content: "Relatórios de Conformidade — Natura SecOps" },
      {
        property: "og:description",
        content: "Conformidade de ativos, prioridades de correção e análise por time de segurança.",
      },
    ],
  }),
  component: Relatorios,
});

const SEVERITY_ORDER = ["Crítica", "Alta", "Média", "Baixa"];

function Relatorios() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/relatorios" });
  const team = search.team ?? "Todas";
  const os = search.os ?? "";
  const q = search.q ?? "";
  const [qInput, setQInput] = useState(q);
  const [osInput, setOsInput] = useState(os);
  const debouncedQ = useDebouncedValue(qInput, 300);
  const debouncedOs = useDebouncedValue(osInput, 300);
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "controls" | "teams">(
    "overview",
  );

  const setParam = (key: keyof RelatoriosSearch, value: string) =>
    navigate({
      search: (prev: RelatoriosSearch) => ({
        ...prev,
        [key]: value && value !== "Todas" ? value : undefined,
      }),
    });

  // Sync inputs when URL changes externally (back/forward)
  useEffect(() => {
    if (q !== qInput && debouncedQ === qInput) {
      setQInput(q);
    }
  }, [q, qInput, debouncedQ]);

  useEffect(() => {
    if (os !== osInput && debouncedOs === osInput) {
      setOsInput(os);
    }
  }, [os, osInput, debouncedOs]);

  useEffect(() => {
    if (debouncedQ !== q) {
      navigate({
        search: (prev: RelatoriosSearch) => ({
          ...prev,
          q: debouncedQ || undefined,
        }),
      });
    }
  }, [debouncedQ, q, navigate]);

  useEffect(() => {
    if (debouncedOs !== os) {
      navigate({
        search: (prev: RelatoriosSearch) => ({
          ...prev,
          os: debouncedOs || undefined,
        }),
      });
    }
  }, [debouncedOs, os, navigate]);

  const filters = useMemo(
    () => ({ team: team === "Todas" ? undefined : team, os: os || undefined }),
    [team, os],
  );
  const { data, isLoading, isError } = useQuery(reportsQueryOptions(filters));

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    const term = debouncedQ.trim().toLowerCase();
    if (!term) return data.assets;
    return data.assets.filter(
      (a) =>
        a.hostname.toLowerCase().includes(term) ||
        a.ip.toLowerCase().includes(term) ||
        a.os.toLowerCase().includes(term) ||
        a.team.toLowerCase().includes(term),
    );
  }, [data, debouncedQ]);

  if (isLoading || !data) {
    return (
      <Shell
        title="Relatórios de Conformidade"
        subtitle="Dashboard tático de conformidade e risco."
      >
        <ReportsSkeleton />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell
        title="Relatórios de Conformidade"
        subtitle="Dashboard tático de conformidade e risco."
      >
        <div className="slab corner-cut p-6 text-center">
          <h2 className="stencil text-sm text-critica">Erro ao carregar relatórios</h2>
          <p className="mt-2 text-xs text-muted-foreground">Falha na consulta à base Qualys.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Relatórios de Conformidade"
      subtitle="Conformidade por time, SO e prioridade de correção."
    >
      <FilterBar
        team={team}
        setTeam={(v) => setParam("team", v)}
        os={osInput}
        setOs={setOsInput}
        q={q}
        qInput={qInput}
        setQInput={setQInput}
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={LayoutDashboard}
          label="Ativos avaliados"
          value={fmt(data.kpis.totalAssets)}
          sub={`${fmt(data.kpis.assetsWithCritical)} com críticas`}
          tone="default"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Conformidade"
          value={`${data.kpis.complianceScore}%`}
          sub={data.kpis.complianceScore >= 80 ? "Dentro do aceitável" : "Atenção necessária"}
          tone={
            data.kpis.complianceScore >= 80
              ? "good"
              : data.kpis.complianceScore >= 50
                ? "warn"
                : "bad"
          }
        />
        <KpiCard
          icon={ShieldAlert}
          label="Vulnerabilidades"
          value={fmt(data.kpis.totalVulns)}
          sub="ativas no escopo filtrado"
          tone="default"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Ativos críticos"
          value={fmt(data.kpis.assetsWithCritical)}
          sub={`${data.kpis.totalAssets ? Math.round((data.kpis.assetsWithCritical / data.kpis.totalAssets) * 100) : 0}% do total`}
          tone="bad"
        />
      </section>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-1">
        {[
          { key: "overview", label: "Visão geral", icon: LayoutDashboard },
          { key: "assets", label: "Ativos", icon: Monitor },
          { key: "controls", label: "Top controles", icon: FileBarChart },
          { key: "teams", label: "Times", icon: Server },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-[11px] transition-colors ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              <span className="stencil">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" && <OverviewTab data={data} />}
      {activeTab === "assets" && <AssetsTab assets={filteredAssets} q={debouncedQ} />}
      {activeTab === "controls" && <ControlsTab data={data} />}
      {activeTab === "teams" && <TeamsTab teams={data.teamRows} />}
    </Shell>
  );
}

function FilterBar({
  team,
  setTeam,
  os,
  setOs,
  q,
  qInput,
  setQInput,
}: {
  team: string;
  setTeam: (t: string) => void;
  os: string;
  setOs: (o: string) => void;
  q: string;
  qInput: string;
  setQInput: (s: string) => void;
}) {
  const navigate = useNavigate({ from: "/relatorios" });

  const activeFilters = [
    team !== "Todas" ? { key: "team" as const, label: `Time: ${team}` } : null,
    os ? { key: "os" as const, label: `SO: ${os}` } : null,
    q ? { key: "q" as const, label: `Busca: ${q}` } : null,
  ].filter(Boolean) as { key: keyof RelatoriosSearch; label: string }[];

  return (
    <section className="slab mb-4 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[150px]">
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">Time</span>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas" className="text-xs">
                Todas
              </SelectItem>
              {teamNames.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[150px]">
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">SO</span>
          <input
            type="text"
            value={os}
            onChange={(e) => setOs(e.target.value)}
            placeholder="ex: Windows, Linux"
            className="h-9 w-full rounded-md border border-border bg-input px-3 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="min-w-[220px] flex-1">
          <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Buscar hostname, IP, SO ou time..."
              className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="stencil text-[10px] text-muted-foreground">Filtros ativos:</span>
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() =>
                navigate({
                  search: (prev: RelatoriosSearch) => ({
                    ...prev,
                    [f.key]: undefined,
                  }),
                })
              }
              className="stencil flex items-center gap-1.5 border border-primary px-3 py-1 text-[10px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {f.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() =>
              navigate({ search: () => ({ team: undefined, os: undefined, q: undefined }) })
            }
            className="stencil border border-border px-3 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  sub: string;
  tone: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-primary"
      : tone === "warn"
        ? "text-media"
        : tone === "bad"
          ? "text-critica"
          : "text-foreground";
  return (
    <div className="slab corner-cut p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="stencil text-[10px] text-muted-foreground">{label}</span>
        <Icon size={16} className={toneClass} />
      </div>
      <p className={`font-display text-3xl leading-none font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function OverviewTab({ data }: { data: ReportData }) {
  const sevData = useMemo(
    () =>
      SEVERITY_ORDER.map((sev) => ({
        name: sev,
        value: data.categories.filter((c) => c.sev === sev).reduce((sum, c) => sum + c.count, 0),
      })).filter((d) => d.value > 0),
    [data],
  );

  const osData = useMemo(
    () =>
      data.osRows
        .slice()
        .sort((a, b) => b.assets - a.assets)
        .slice(0, 10)
        .map((r) => ({
          name: r.os,
          ativos: r.assets,
          criticos: r.critical,
          vulns: r.vulns,
          conformidade: r.compliancePct,
        })),
    [data],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="slab corner-cut p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="stencil text-xs text-primary">Conformidade por SO</h2>
          <span className="text-[10px] text-muted-foreground">top 10 por quantidade de ativos</span>
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={osData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--steel)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length || !payload[0]) return null;
                  const p = payload[0].payload as (typeof osData)[number];
                  return (
                    <div className="slab border-primary/40 p-2 text-xs">
                      <p className="mb-1 font-bold">{p.name}</p>
                      <p>Conformidade: {p.conformidade}%</p>
                      <p>Ativos: {fmt(p.ativos)}</p>
                      <p>Críticos: {fmt(p.criticos)}</p>
                      <p>Vulns: {fmt(p.vulns)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="conformidade" radius={[0, 4, 4, 0]}>
                {osData.map((d) => (
                  <Cell
                    key={d.name}
                    fill={
                      d.conformidade >= 80
                        ? "var(--baixa)"
                        : d.conformidade >= 50
                          ? "var(--media)"
                          : "var(--critica)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Distribuição por severidade</h2>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "2px solid var(--primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              />
              <Pie
                data={sevData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {sevData.map((d) => (
                  <Cell key={d.name} fill={severityToken[d.name]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function AssetsTab({ assets, q }: { assets: ReportData["assets"]; q: string }) {
  const navigate = useNavigate({ from: "/relatorios" });
  return (
    <section className="slab corner-cut p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="stencil text-xs text-primary">Inventário de ativos</h2>
        <span className="text-[10px] text-muted-foreground">
          {assets.length} ativo{assets.length !== 1 ? "s" : ""}
          {q ? ` filtrado${assets.length !== 1 ? "s" : ""} por "${q}"` : ""}
        </span>
      </div>
      {assets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="stencil text-sm text-muted-foreground">
            Nenhum resultado para os filtros selecionados
          </p>
          <button
            onClick={() =>
              navigate({ search: () => ({ team: undefined, os: undefined, q: undefined }) })
            }
            className="stencil mt-3 border border-border px-4 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <Th>Hostname / IP</Th>
                <Th>SO</Th>
                <Th>Time</Th>
                <Th className="text-right">Vulns</Th>
                <Th className="text-right">Críticas</Th>
                <Th className="text-right">Conformidade</Th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.qgHostId} className="border-b border-border/60">
                  <td className="px-2 py-2">
                    <p className="font-bold">{a.hostname}</p>
                    <p className="text-[10px] text-muted-foreground">{a.ip}</p>
                  </td>
                  <td className="px-2 py-2">{a.os}</td>
                  <td className="px-2 py-2">
                    <span className="stencil rounded bg-steel px-2 py-1 text-[10px]">{a.team}</span>
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(a.vulns)}</td>
                  <td className="px-2 py-2 text-right text-critica">{fmt(a.critical)}</td>
                  <td className="px-2 py-2 text-right">
                    <ComplianceBadge pct={a.compliancePct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ControlsTab({ data }: { data: ReportData }) {
  const pareto = useMemo(
    () =>
      data.topQids.map((q, i) => ({
        ...q,
        cumulative: data.topQids.slice(0, i + 1).reduce((sum, x) => sum + x.count, 0),
      })),
    [data],
  );
  const total = useMemo(() => data.topQids.reduce((sum, q) => sum + q.count, 0), [data]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Top 20 controles falhos (Pareto)</h2>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pareto}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="qid"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
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
                formatter={(value, name) => [
                  name === "count" ? fmt(Number(value)) : `${Number(value).toFixed(1)}%`,
                  name === "count" ? "Falhas" : "Acumulado",
                ]}
              />
              <Bar yAxisId="left" dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="cumulative" fill="var(--media)" name="Acumulado %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Top categorias</h2>
        {data.categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma categoria encontrada.</p>
        ) : (
          <div className="space-y-3">
            {data.categories.slice(0, 15).map((c) => (
              <div key={`${c.name}-${c.sev}`} className="flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: severityToken[c.sev] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{c.name}</p>
                  <p className="text-[9px] text-muted-foreground">{c.sev}</p>
                </div>
                <span className="stencil text-xs font-bold">{fmt(c.count)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="stencil mb-2 text-[10px] text-muted-foreground">
            DETALHAMENTO DOS TOP QIDs
          </h3>
          <div className="max-h-[180px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <Th className="text-left">QID</Th>
                  <Th className="text-left">Título</Th>
                  <Th className="text-right">Falhas</Th>
                  <Th className="text-right">% do total</Th>
                </tr>
              </thead>
              <tbody>
                {data.topQids.slice(0, 15).map((q) => (
                  <tr key={q.qid} className="border-b border-border/60">
                    <td className="px-2 py-1.5 font-bold text-primary">{q.qid}</td>
                    <td className="max-w-[220px] truncate px-2 py-1.5" title={q.title}>
                      {q.title}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(q.count)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {total ? `${((q.count / total) * 100).toFixed(1)}%` : "0%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamsTab({ teams }: { teams: ReportData["teamRows"] }) {
  const teamData = useMemo(
    () =>
      teams.map((t) => ({
        name: t.team,
        ativos: t.assets,
        vulns: t.vulns,
        criticas: t.critical,
        conformidade: t.compliancePct,
      })),
    [teams],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Conformidade por time</h2>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamData} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--steel)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length || !payload[0]) return null;
                  const p = payload[0].payload as (typeof teamData)[number];
                  return (
                    <div className="slab border-primary/40 p-2 text-xs">
                      <p className="mb-1 font-bold">{p.name}</p>
                      <p>Conformidade: {p.conformidade}%</p>
                      <p>Ativos: {fmt(p.ativos)}</p>
                      <p>Vulns: {fmt(p.vulns)}</p>
                      <p>Críticas: {fmt(p.criticas)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="conformidade" radius={[0, 4, 4, 0]}>
                {teamData.map((d) => (
                  <Cell
                    key={d.name}
                    fill={
                      d.conformidade >= 80
                        ? "var(--baixa)"
                        : d.conformidade >= 50
                          ? "var(--media)"
                          : "var(--critica)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="slab corner-cut p-5">
        <h2 className="stencil mb-4 text-xs text-primary">Ranking de times</h2>
        <div className="space-y-3">
          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum time encontrado.</p>
          ) : (
            teams.map((t) => (
              <div key={t.team} className="flex items-center gap-3">
                <ComplianceBadge pct={t.compliancePct} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{t.team}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {fmt(t.assets)} ativos · {fmt(t.vulns)} vulns · {fmt(t.critical)} críticas
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ComplianceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 80
      ? "bg-primary/20 text-primary"
      : pct >= 50
        ? "bg-media/20 text-media"
        : "bg-critica/20 text-critica";
  return (
    <span className={`stencil inline-block rounded px-2 py-1 text-[10px] ${color}`}>{pct}%</span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`stencil px-2 py-2 text-[10px] text-muted-foreground ${className ?? "text-left"}`}
    >
      {children}
    </th>
  );
}

function ReportsSkeleton() {
  return (
    <>
      <div className="mb-6 h-12 animate-pulse rounded bg-steel" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="slab corner-cut h-[100px] animate-pulse bg-steel" />
        ))}
      </div>
      <div className="mb-6 flex gap-2 border-b border-border pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded bg-steel" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="slab corner-cut h-[340px] animate-pulse bg-steel" />
        <div className="slab corner-cut h-[340px] animate-pulse bg-steel" />
      </div>
    </>
  );
}
