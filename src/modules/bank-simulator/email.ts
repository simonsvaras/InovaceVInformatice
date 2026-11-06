import { formatCzk } from "@/modules/payments/qr";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type SimulatedPaymentEmailData = {
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  amountHalere: number;
  sourceTransactionId: string;
  recordedOrigin: "user" | "public_qr";
};

export function buildSimulatedPaymentEmail(data: SimulatedPaymentEmailData) {
  const scope = data.teamName ? `${data.clubName} · ${data.teamName}` : data.clubName;
  const subject = `Demo evidence platby – ${data.assessmentTitle}`;
  const origin = data.recordedOrigin === "public_qr"
    ? "Veřejná QR platební stránka"
    : "Přihlášený demo simulátor";
  const text = [
    "DEMO – nejde o potvrzení skutečného bankovního převodu ani spojení s Fio.",
    "",
    `V aplikaci byla zaevidována simulovaná platební událost pro ${data.athleteName}.`,
    `Předpis: ${data.assessmentTitle}`,
    `Klub / tým: ${scope}`,
    `Částka: ${formatCzk(data.amountHalere)}`,
    `Demo ID pohybu: ${data.sourceTransactionId}`,
    `Vstup pohybu: ${origin}`,
    "",
    "Původ záznamu je trvale označen jako simulated.",
  ].join("\n");
  const html = `<p><strong>DEMO – nejde o potvrzení skutečného bankovního převodu ani spojení s Fio.</strong></p>
    <p>V aplikaci byla zaevidována simulovaná platební událost pro ${escapeHtml(data.athleteName)}.</p>
    <ul>
      <li>Předpis: ${escapeHtml(data.assessmentTitle)}</li>
      <li>Klub / tým: ${escapeHtml(scope)}</li>
      <li>Částka: ${escapeHtml(formatCzk(data.amountHalere))}</li>
      <li>Demo ID pohybu: ${escapeHtml(data.sourceTransactionId)}</li>
      <li>Vstup pohybu: ${escapeHtml(origin)}</li>
    </ul>
    <p>Původ záznamu je trvale označen jako <code>simulated</code>.</p>`;
  return { subject, text, html };
}
