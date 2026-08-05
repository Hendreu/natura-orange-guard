import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Boxes, Bug, Gauge, ShieldHalf, Timer } from "lucide-react";

const nav = [
  { to: "/", label: "Visão geral", icon: Gauge },
  { to: "/vulnerabilidades", label: "Vulnerabilidades", icon: Bug },
  { to: "/ativos", label: "Ativos", icon: Boxes },
  { to: "/sla", label: "SLA & Risco", icon: Timer },
  { to: "/squads", label: "Squads", icon: ShieldHalf },
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
          <div className="scan-strip mb-4 h-2 w-full" />
          <p className="font-display text-xl leading-none font-bold">
            NATURA<span className="text-primary">/SEC</span>
          </p>
          <p className="stencil mt-1 text-[9px] text-muted-foreground">Security Operations</p>
        </div>
        <nav className="flex-1 p-3">
          {nav.map((n) => {
            const active = path === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`mb-2 flex items-center gap-3 border px-3 py-2.5 text-[11px] transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon size={15} strokeWidth={2.5} />
                <span className="stencil">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <p className="flex items-center gap-2 text-[10px] text-baixa">
            <Activity size={12} /> BASE SINCRONIZADA
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">Snapshot: Semana 3 / Julho</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-border bg-card px-6 py-5">
          <p className="stencil text-[10px] text-primary">
            Natura // Divisão de Segurança da Informação
          </p>
          <h1 className="font-display text-3xl leading-none font-bold sm:text-4xl">{title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
          <nav className="mt-4 flex flex-wrap gap-2 lg:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`stencil border px-3 py-1.5 text-[10px] ${
                  path === n.to
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="p-6">{children}</main>
        <footer className="stencil px-6 pb-8 text-[10px] text-muted-foreground">
          Natura SecOps // dados consolidados — uso interno
        </footer>
      </div>
    </div>
  );
}
