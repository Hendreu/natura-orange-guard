import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "Todas", label: "Tudo" },
  { value: "All Cloud", label: "All Clouds" },
  { value: "All On-Prem", label: "On-Prem" },
];

export function TagFilter() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search });
  const value = (search.team as string | undefined) ?? "Todas";

  const setTeam = (next: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        team: next === "Todas" ? undefined : next,
      }),
    });
  };

  return (
    <div className="min-w-[140px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Ambiente</span>
      <Select value={value} onValueChange={(v) => setTeam(v)}>
        <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
