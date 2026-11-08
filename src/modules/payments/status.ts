import { todayInPrague } from "@/lib/dates";

export type DebtStatus =
  | "waiting"
  | "overdue"
  | "reported"
  | "partial"
  | "paid"
  | "overpaid"
  | "cancelled";

export function deriveDebtState(input: {
  amountHalere: number;
  allocatedHalere: number;
  dueDate: string;
  hasPendingClaim: boolean;
  cancelled?: boolean;
  today?: string;
}) {
  if (input.cancelled) {
    return {
      status: "cancelled" as DebtStatus,
      remainingHalere: 0,
      overpaidHalere: 0,
    };
  }
  const remainingHalere = Math.max(
    input.amountHalere - input.allocatedHalere,
    0,
  );
  const overpaidHalere = Math.max(
    input.allocatedHalere - input.amountHalere,
    0,
  );
  let status: DebtStatus;

  if (input.allocatedHalere > input.amountHalere) status = "overpaid";
  else if (input.allocatedHalere === input.amountHalere) status = "paid";
  else if (input.hasPendingClaim) status = "reported";
  else if (input.allocatedHalere > 0) status = "partial";
  else if (input.dueDate < (input.today ?? todayInPrague())) status = "overdue";
  else status = "waiting";

  return { status, remainingHalere, overpaidHalere };
}

export function debtStatusLabel(status: DebtStatus) {
  return {
    waiting: "Čeká na platbu",
    overdue: "Po splatnosti",
    reported: "Nahlášeno — čeká na potvrzení",
    partial: "Částečně zaplaceno",
    paid: "Zaplaceno",
    overpaid: "Přeplaceno",
    cancelled: "Zrušeno",
  }[status];
}

export type PaymentKind = "manual_claim" | "cash" | "simulated" | "fio" | "correction";

export function paymentMethodLabel(kind: string) {
  return ({
    manual_claim: "Ručně potvrzená úhrada",
    cash: "Hotovost",
    simulated: "Demo pohyb (simulace)",
    fio: "Bankovní pohyb z Fio",
    correction: "Oprava evidence (protizápis)",
  } as Record<string, string>)[kind] ?? "Evidovaná úhrada";
}

/** Kdo záznam potvrdil; u demo pohybu nejde o ověření banky ani trenéra. */
export function paymentConfirmedByLabel(kind: string, actorName: string | null) {
  if (kind === "simulated") return "Demo simulace (nejde o bankovně ověřený převod)";
  if (kind === "fio") return "Načteno z Fio API a spárováno systémem";
  if (kind === "cash") return `Hotovost zapsal(a) ${actorName ?? "systém"}`;
  if (kind === "correction") return `Opravil(a) ${actorName ?? "systém"}`;
  return `Potvrdil(a) ${actorName ?? "systém"}`;
}
