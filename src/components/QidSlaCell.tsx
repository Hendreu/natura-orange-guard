import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatQidSla } from "@/lib/qid-sla";
import type { QidSla } from "@/lib/qid-sla";

export function QidSlaCell({ sla }: { readonly sla: QidSla }) {
  const label = formatQidSla(sla);
  const stateDetails: Record<QidSla["state"], string> = {
    open: `Limite SLA: ${sla.thresholdDays ?? "indisponível"} dias. Última detecção (LastFound): ${sla.lastFoundDate ?? "indisponível"}. Vencimento: ${sla.dueDate ?? "indisponível"}. Pior detecção aberta do grupo. Dias de calendário UTC. LastFound atual é sempre a referência, inclusive em reaberturas; detecções Fixed são excluídas.`,
    fixed: "Detecções corrigidas (Fixed): sem contagem regressiva e fora do filtro de SLA.",
    "not-applicable":
      "Severidade baixa não monitorada. A política de SLA acompanha apenas crítica, alta e média.",
    unknown:
      "Dados insuficientes para calcular o SLA. Sem contagem regressiva ou vencimento disponível.",
  };
  const detail = `${stateDetails[sla.state]} Data de referência do servidor (UTC): ${sla.asOfDate}.`;
  const running = sla.state === "open" && sla.daysRemaining !== null;
  const tone = running
    ? sla.daysRemaining === 0
      ? "bg-primary/20 text-primary-foreground"
      : sla.daysRemaining < 0
        ? "text-critica"
        : "text-foreground"
    : "text-muted-foreground";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Detalhes do SLA: ${label}. ${detail}`}
            onClick={(event) => event.stopPropagation()}
            className={`whitespace-nowrap rounded-sm px-2 py-1 text-left font-mono text-xs font-medium tabular-nums hover:bg-muted active:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-xs border border-border bg-card p-3 text-xs text-card-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
