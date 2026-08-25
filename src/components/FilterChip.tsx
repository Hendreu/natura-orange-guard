import { cn } from "@/lib/utils";
import { fmt } from "@/lib/sla-data";

export function FilterChip({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "stencil inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-foreground hover:border-primary hover:text-primary",
      )}
      style={
        active && color ? { borderColor: color, color, backgroundColor: `${color}1A` } : undefined
      }
    >
      <span>{label}</span>
      <span className="rounded bg-background px-1 text-[9px] text-muted-foreground">
        {fmt(count)}
      </span>
    </button>
  );
}
