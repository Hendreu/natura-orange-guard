# Task 3: Create `FilterGroup` component

**Goal:** Build a reusable checkbox filter group with count badges.

**File to create:**

- `src/components/FilterGroup.tsx`

**Implementation:**

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

export function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="space-y-2">
      <h4 className="stencil text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[11px] transition-colors hover:bg-steel",
              selected.includes(o.value) && "bg-steel",
            )}
          >
            <span className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
                className="h-3.5 w-3.5"
              />
              <span className="text-foreground">{o.label}</span>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {o.count.toLocaleString("pt-BR")}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

**Verification:**

- Run `bun run build` and ensure it succeeds.
- Render the component in isolation if possible (story not required).

**Report file:** `.superpowers/sdd/task-3-report.md`
