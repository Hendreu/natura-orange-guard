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
    <div className="flex items-center gap-1 rounded-md border border-border bg-input p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setYearScope(o.value)}
          className={`stencil rounded px-2.5 py-1.5 text-[10px] transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
