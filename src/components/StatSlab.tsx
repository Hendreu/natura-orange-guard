import { fmt, type Trend } from "@/lib/sla-data";

export function TrendTag({ trend, invert = false }: { trend?: Trend | undefined; invert?: boolean }) {
  if (!trend) return null;
  const up = trend.diff > 0;
  const flat = trend.diff === 0;
  const good = invert ? up : !up;
  const color = flat
    ? "text-muted-foreground"
    : good
      ? "text-baixa"
      : "text-critica";
  return (
    <span className={`text-[11px] font-bold tracking-wider ${color}`}>
      {flat ? "—" : up ? "▲" : "▼"} {trend.diff > 0 ? "+" : ""}
      {trend.diff} ({trend.pct > 0 ? "+" : ""}
      {trend.pct}%)
    </span>
  );
}

export function StatSlab({
  label,
  value,
  trend,
  sub,
  accent = false,
  invertTrend = false,
  onClick,
  action,
}: {
  label: string;
  value: number | string;
  trend?: Trend | undefined;
  sub?: React.ReactNode | undefined;
  accent?: boolean | undefined;
  invertTrend?: boolean | undefined;
  onClick?: (() => void) | undefined;
  action?: string | undefined;
}) {
  const body = (
    <>
      <p className="stencil text-[10px] text-muted-foreground">{label}</p>
      <p
        className={`font-display text-4xl leading-none font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {typeof value === "number" ? fmt(value) : value}
      </p>
      {sub ? <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <TrendTag trend={trend} invert={invertTrend} />
        {action ? <span className="stencil text-[9px] text-primary">{action} →</span> : null}
      </div>
    </>
  );

  const cls = `${accent ? "slab-signal" : "slab"} corner-cut p-4`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} tappable w-full text-left`}>
        {body}
      </button>
    );
  }

  return <div className={cls}>{body}</div>;
}

