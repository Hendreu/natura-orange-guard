import { doesNotMatch, match } from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { QidSla } from "@/lib/qid-sla";
import { QidSlaCell } from "./QidSlaCell";

const openSla: QidSla = {
  state: "open",
  thresholdDays: 30,
  lastFoundDate: "2026-09-09",
  dueDate: "2026-10-09",
  daysRemaining: 0,
  asOfDate: "2026-10-09",
};

describe("QidSlaCell", () => {
  it("shows due today when the server countdown is zero", () => {
    const sla = openSla;

    const html = renderToStaticMarkup(<QidSlaCell sla={sla} />);

    match(html, />Vence hoje<\/button>/);
    doesNotMatch(html, />Faltam|vencido/);
  });

  it("shows days remaining when the server countdown is positive", () => {
    const sla: QidSla = { ...openSla, daysRemaining: 12 };

    const html = renderToStaticMarkup(<QidSlaCell sla={sla} />);

    match(html, />Faltam 12d<\/button>/);
    doesNotMatch(html, /vencido/);
  });

  it("keeps the negative sign when the server countdown is overdue", () => {
    const sla: QidSla = { ...openSla, daysRemaining: -7 };

    const html = renderToStaticMarkup(<QidSlaCell sla={sla} />);

    match(html, />-7d \(vencido\)<\/button>/);
    doesNotMatch(html, />7d \(vencido\)/);
  });

  it("exposes the SLA limit and exact server calendar dates when the SLA is open", () => {
    const sla = openSla;

    const html = renderToStaticMarkup(<QidSlaCell sla={sla} />);

    match(html, /aria-label="[^"]*Limite SLA: 30 dias/);
    match(html, /Última detecção \(LastFound\): 2026-09-09/);
    match(html, /LastFound atual é sempre a referência, inclusive em reaberturas/);
    match(html, /detecções Fixed são excluídas/);
    doesNotMatch(html, /Limite provisório|Primeira detecção|Reabertura não reinicia/);
    match(html, /Vencimento: 2026-10-09/);
    match(html, /Data de referência do servidor \(UTC\): 2026-10-09/);
  });

  for (const { state, label } of [
    { state: "fixed", label: "Corrigida" },
    { state: "not-applicable", label: "Não monitorada" },
    { state: "unknown", label: "SLA indisponível" },
  ] as const) {
    it(`shows ${label} without a countdown or misleading dates when state is ${state}`, () => {
      const sla: QidSla = { ...openSla, state, daysRemaining: -7 };

      const html = renderToStaticMarkup(<QidSlaCell sla={sla} />);

      match(html, new RegExp(`>${label}</button>`));
      doesNotMatch(
        html,
        /Faltam|Vence hoje|vencido|Primeira detecção:|Última detecção|LastFound|Vencimento:|2026-09-09/,
      );
      match(html, /Data de referência do servidor \(UTC\): 2026-10-09/);
    });
  }
});
