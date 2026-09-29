import { useNavigate, useRouterState } from "@tanstack/react-router";

const OPTIONS = [
  { value: "current", label: "Ano atual" },
  { value: "slipped", label: "Retroativos" },
  { value: "all", label: "Todo período" },
] as const;

export function YearScopeFilter() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search });
  const value = (search.yearScope as (typeof OPTIONS)[number]["value"] | undefined) ?? "current";

  const setYearScope = (next: (typeof OPTIONS)[number]["value"]) => {
    navigate({
      search: (prev) => ({
        ...prev,
        yearScope: next === "current" ? undefined : next,
      }),
    });
  };

  return (
    <div className="min-w-[140px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Período</span>
      <div className="flex h-9 items-center gap-1 rounded-md border border-border bg-input p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setYearScope(o.value)}
            className={`stencil h-full flex-1 whitespace-nowrap rounded px-2 text-[10px] transition-colors ${
              value === o.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
