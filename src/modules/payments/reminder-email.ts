import { absoluteAppUrl } from "@/modules/notifications/email";
import { formatCzk } from "@/modules/payments/qr";

export function buildPaymentReminderEmail(input: {
  receivableId: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  remainingHalere: number;
  dueDate: string;
}) {
  const detailUrl = absoluteAppUrl(`/dluhy/${input.receivableId}`);
  const amount = formatCzk(input.remainingHalere);
  const scope = input.teamName ?? "celý klub";
  const text = [
    "Automatické připomenutí evidované platby",
    `Sportovec: ${input.athleteName}`,
    `Předpis: ${input.assessmentTitle}`,
    `Klub / tým: ${input.clubName} / ${scope}`,
    `Zbývá uhradit: ${amount}`,
    `Splatnost: ${input.dueDate}`,
    `Platební údaje a QR: ${detailUrl}`,
    "Tato neutrální zpráva byla vytvořena aplikací. Není potvrzením bankovního převodu ani zprávou o jeho ověření.",
  ].join("\n");

  return {
    subject: `Připomenutí platby: ${input.assessmentTitle}`,
    text,
    html: text
      .split("\n")
      .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
      .join(""),
  };
}
