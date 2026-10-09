import { z } from "zod";

export type QidSla = {
  readonly state: "open" | "fixed" | "not-applicable" | "unknown";
  readonly thresholdDays: number | null;
  readonly lastFoundDate: string | null;
  readonly dueDate: string | null;
  readonly daysRemaining: number | null;
  readonly asOfDate: string;
};

export type QidSlaFilter =
  | { readonly mode: "within" | "overdue" | "due-today" }
  | { readonly mode: "next"; readonly days: number };

export const qidSlaFilterSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("within") }).strict(),
  z.object({ mode: z.literal("overdue") }).strict(),
  z.object({ mode: z.literal("due-today") }).strict(),
  z
    .object({ mode: z.literal("next"), days: z.number().finite().int().positive().max(2147483647) })
    .strict(),
]);

export type QidSlaSearch = {
  readonly sla?: QidSlaFilter["mode"] | undefined;
  readonly slaDays?: number | undefined;
};

export function parseQidSlaSearch(search: Readonly<Record<string, unknown>>): QidSlaSearch {
  switch (search["sla"]) {
    case "within":
      return { sla: "within" };
    case "overdue":
      return { sla: "overdue" };
    case "due-today":
      return { sla: "due-today" };
    case "next": {
      const rawDays = search["slaDays"];
      const days =
        typeof rawDays === "number"
          ? rawDays
          : typeof rawDays === "string" && rawDays.trim()
            ? Number(rawDays)
            : NaN;
      const parsed = qidSlaFilterSchema.safeParse({ mode: "next", days });
      return parsed.success ? { sla: "next", slaDays: days } : {};
    }
    default:
      return {};
  }
}

export function qidSlaFilterFromSearch(search: QidSlaSearch): QidSlaFilter | undefined {
  const parsed = qidSlaFilterSchema.safeParse(
    search.sla === "next" ? { mode: search.sla, days: search.slaDays } : { mode: search.sla },
  );
  return parsed.success ? parsed.data : undefined;
}

export function formatQidSla(sla: QidSla): string {
  switch (sla.state) {
    case "open": {
      const days = sla.daysRemaining;
      if (days === null) return "SLA indisponível";
      if (days > 0) return `Faltam ${days}d`;
      return days === 0 ? "Vence hoje" : `${days}d (vencido)`;
    }
    case "fixed":
      return "Corrigida";
    case "not-applicable":
      return "Não monitorada";
    case "unknown":
      return "SLA indisponível";
    default: {
      const exhaustive: never = sla.state;
      return exhaustive;
    }
  }
}
