import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TAG_FILTER_OPTIONS, type TagFilter } from "@/lib/constants";

export function TagFilter() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const value = search.tagFilter ?? "full";

  const setTagFilter = (next: TagFilter) => {
    navigate({
      search: (prev) => ({
        ...prev,
        tagFilter: next === "full" ? undefined : next,
      }),
    });
  };

  return (
    <div className="min-w-[140px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Ambiente</span>
      <Select value={value} onValueChange={(v) => setTagFilter(v as TagFilter)}>
        <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAG_FILTER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
