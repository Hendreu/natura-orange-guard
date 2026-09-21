import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagsQueryOptions, type Tag } from "@/lib/sla-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export function TagFilter() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search });
  const selected: number[] = Array.isArray(search.tags) ? search.tags : [];
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useQuery(tagsQueryOptions());

  const toggle = (id: number) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    navigate({
      search: (prev) => ({
        ...prev,
        tags: next.length ? next : undefined,
      }),
    });
  };

  const clear = () =>
    navigate({
      search: (prev) => ({ ...prev, tags: undefined }),
    });

  const selectedTags: Tag[] = selected
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined);

  return (
    <div className="min-w-[200px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Tags</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-input px-3 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className={cn("truncate", !selectedTags.length && "text-muted-foreground")}>
              {selectedTags.length ? selectedTags.map((t) => t.name).join(", ") : "Selecionar tags"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0">
          <Command>
            <CommandInput placeholder="Buscar tag..." />
            <CommandList>
              <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => {
                  const active = selected.includes(tag.id);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggle(tag.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate text-xs">{tag.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="text-[10px]">
              {tag.name}
              <button
                type="button"
                aria-label={`Remover ${tag.name}`}
                title={`Remover ${tag.name}`}
                onClick={() => toggle(tag.id)}
                className="ml-1 inline-flex min-h-[20px] min-w-[20px] items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-muted-foreground underline"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
