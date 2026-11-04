import { todayInPrague } from "@/lib/dates";

export type DebtStatus =
  | "waiting"
  | "overdue"
  | "reported"
  | "partial"
  | "paid"
  | "overpaid";

export function deriveDebtState(input: {
  amountHalere: number;
  allocatedHalere: number;
  dueDate: string;
  hasPendingClaim: boolean;
  today?: string;
}) {
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
  }[status];
}
