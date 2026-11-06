import { absoluteAppUrl } from "@/modules/notifications/email";
import { formatCzk, paymentQrPng } from "@/modules/payments/qr";

type ReceivableEmailData = {
  receivableId: string;
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  accountNumber: string;
  amountHalere: number;
  variableSymbol: string;
  paymentMessage: string;
  dueDate: string;
  publicPaymentUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
        character
      ]!,
  );
}

export async function buildReceivableEmail(data: ReceivableEmailData) {
  const qrPng = await paymentQrPng(data.publicPaymentUrl);
  const detailUrl = absoluteAppUrl(`/dluhy/${data.receivableId}`);
  const scope = data.teamName ?? "Celý klub";
  const amount = formatCzk(data.amountHalere);
  const text = [
    `Nový předpis: ${data.assessmentTitle}`,
    `Sportovec: ${data.athleteName}`,
    `Klub / tým: ${data.clubName} / ${scope}`,
    `Částka: ${amount}`,
    `Splatnost: ${data.dueDate}`,
    `Účet: ${data.accountNumber}`,
    `Variabilní symbol: ${data.variableSymbol}`,
    `Zpráva pro příjemce: ${data.paymentMessage}`,
    `Veřejná platební stránka: ${data.publicPaymentUrl}`,
    `Detail dluhu: ${detailUrl}`,
    "Veřejná stránka vytvoří pouze simulovaný příchozí pohyb; aplikace peníze nepřijímá ani nepřevádí.",
  ].join("\n");
  const html = `
    <h1>${escapeHtml(data.assessmentTitle)}</h1>
    <p>Sportovec: <strong>${escapeHtml(data.athleteName)}</strong></p>
    <p>${escapeHtml(data.clubName)} / ${escapeHtml(scope)}</p>
    <ul>
      <li>Částka: <strong>${escapeHtml(amount)}</strong></li>
      <li>Splatnost: ${escapeHtml(data.dueDate)}</li>
      <li>Účet: ${escapeHtml(data.accountNumber)}</li>
      <li>Variabilní symbol: ${escapeHtml(data.variableSymbol)}</li>
      <li>Zpráva: ${escapeHtml(data.paymentMessage)}</li>
    </ul>
    <p><img src="cid:payment-qr" width="280" height="280" alt="QR odkaz na veřejnou platební stránku" /></p>
    <p><a href="${escapeHtml(data.publicPaymentUrl)}">Otevřít veřejnou platbu</a></p>
    <p><a href="${escapeHtml(detailUrl)}">Otevřít detail dluhu</a></p>
    <p>Veřejná stránka vytvoří pouze simulovaný příchozí pohyb; aplikace peníze nepřijímá ani nepřevádí.</p>
  `;

  return {
    subject: `Nový předpis: ${data.assessmentTitle}`,
    text,
    html,
    attachments: [
      {
        filename: `qr-verejna-platba-${data.variableSymbol}.png`,
        content: qrPng.toString("base64"),
        content_type: "image/png",
        content_id: "payment-qr",
      },
    ],
  };
}
