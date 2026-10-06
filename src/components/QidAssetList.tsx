import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, qidAssetsQueryOptions } from "@/lib/sla-data";
import type { QidAssetsInput } from "@/lib/sla-data";

export function QidAssetList({
  input,
  parentDetectionCount,
  onPageChange,
}: {
  readonly input: QidAssetsInput;
  readonly parentDetectionCount: number;
  readonly onPageChange: (page: number) => void;
}) {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    ...qidAssetsQueryOptions(input),
    placeholderData: undefined,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.totalAssets / data.pageSize)) : null;

  return (
    <details className="group/affected-machines space-y-3" aria-label="Máquinas afetadas">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-foreground hover:bg-muted active:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <h3 className="flex items-center gap-2 stencil text-[11px] text-foreground">
          <ChevronRight className="size-4 shrink-0 group-open/affected-machines:rotate-90" aria-hidden="true" />
          Máquinas afetadas
        </h3>
        {!isPending && !isError && data && (
          <span className="text-xs tabular-nums text-foreground" aria-live="polite">
            <strong>{fmt(data.totalAssets)}</strong> hosts únicos ·{" "}
            <strong>{fmt(data.totalDetections)}</strong> detecções
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] font-medium">
          <span className="group-open/affected-machines:hidden">Expandir lista</span>
          <span className="hidden group-open/affected-machines:inline">Recolher lista</span>
        </span>
      </summary>
      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <p className="py-4 text-xs text-muted-foreground" role="status">
            Carregando máquinas afetadas...
          </p>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3 py-4">
            <p className="text-xs text-critica" role="alert">
              Erro ao carregar máquinas afetadas.
            </p>
            <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : data ? (
          <>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Um host pode ter várias detecções deste QID; os totais podem diferir.
              {data.totalDetections !== parentDetectionCount && (
                <> A linha mostra {fmt(parentDetectionCount)} detecções; o detalhamento retornou {fmt(data.totalDetections)}.</>
              )}
            </p>
            {data.assets.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground">Nenhuma máquina encontrada neste recorte.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full text-xs">
                  <caption className="sr-only">Hosts únicos afetados pelo QID {input.row.qid}</caption>
                  <thead>
                    <tr className="border-b border-border bg-steel">
                      {["DNS / Nome", "IP", "Sistema operacional", "Squad", "Detecções"].map((heading) => (
                        <th key={heading} scope="col" className="stencil px-3 py-2 text-left text-[11px] text-muted-foreground">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.assets.map((asset) => (
                      <tr key={asset.qgHostId} className="border-b border-border/60 last:border-0">
                        <td className="break-words px-3 py-2 font-medium text-foreground">
                          {asset.dns.trim() || asset.ip.trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{asset.ip.trim() || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{asset.os.trim() || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{asset.team.trim() || "—"}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-foreground">{fmt(asset.detectionCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
      <nav className="flex flex-wrap items-center gap-3" aria-label="Paginação de máquinas afetadas">
        <Button type="button" variant="outline" size="sm" disabled={input.page <= 1} onClick={() => onPageChange(input.page - 1)}>
          Anterior
        </Button>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          Página {input.page}{totalPages && !isError ? ` de ${totalPages}` : ""} · 50 hosts por página
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || isError || !data || input.page * data.pageSize >= data.totalAssets}
          onClick={() => onPageChange(input.page + 1)}
        >
          Próxima
        </Button>
      </nav>
    </details>
  );
}
