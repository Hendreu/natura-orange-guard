import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Boxes, Bug, Cloud, FileBarChart, Gauge, ShieldHalf, Timer } from "lucide-react";
import { TagFilter } from "@/components/TagFilter";

const nav = [
  { to: "/", label: "Visão geral", icon: Gauge },
  { to: "/vulnerabilidades", label: "Vulnerabilidades", icon: Bug },
  { to: "/ativos", label: "Ativos", icon: Boxes },
  { to: "/sla", label: "SLA & Risco", icon: Timer },
  { to: "/squads", label: "Squads", icon: ShieldHalf },
  { to: "/hardening", label: "Hardening", icon: Cloud },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
];

export function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-5">
          <div className="mb-3 flex items-center gap-3">
            <img src="/logo-icon.png" alt="SRC" className="h-9 w-9 rounded-full object-cover" />
            <p className="font-display text-lg leading-none font-bold">
              Natura<span className="text-primary">Sec</span>
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">Security Operations</p>
        </div>
        <nav className="flex-1 p-3">
          {nav.map((n) => {
            const active = path === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <p className="flex items-center gap-2 text-[10px] text-baixa">
            <Activity size={12} /> Base sincronizada
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Snapshot: Semana 3 / Julho</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-border bg-card px-6 py-5">
          <p className="text-[10px] font-medium tracking-wide text-primary">
            Natura / Segurança da Informação
          </p>
          <h1 className="font-display text-3xl leading-none font-bold text-foreground sm:text-4xl">
            {title}
          </h1>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <TagFilter />
          </div>
          <nav className="mt-4 flex flex-wrap gap-2 lg:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-xl px-3 py-1.5 text-[10px] font-medium ${
                  path === n.to
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="p-6">{children}</main>
        <footer className="px-6 pb-8 text-[10px] text-muted-foreground">
          Natura SecOps — dados consolidados, uso interno
        </footer>
      </div>
    </div>
  );
}
