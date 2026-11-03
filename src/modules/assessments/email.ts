import { absoluteAppUrl } from "@/modules/notifications/email";
import { buildCzechPaymentDescriptor, formatCzk, paymentQrPng } from "@/modules/payments/qr";

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
  const qrData = {
    accountNumber: data.accountNumber,
    amountHalere: data.amountHalere,
    variableSymbol: data.variableSymbol,
    message: data.paymentMessage,
  };
  const qrPng = await paymentQrPng(qrData);
  const detailUrl = absoluteAppUrl(`/dluhy/${data.receivableId}`);
  const scope = data.teamName ?? "Celý klub";
  const amount = formatCzk(data.amountHalere);
  const descriptor = buildCzechPaymentDescriptor(qrData);
  const text = [
    `Nový předpis: ${data.assessmentTitle}`,
    `Sportovec: ${data.athleteName}`,
    `Klub / tým: ${data.clubName} / ${scope}`,
    `Částka: ${amount}`,
    `Splatnost: ${data.dueDate}`,
    `Účet: ${data.accountNumber}`,
    `Variabilní symbol: ${data.variableSymbol}`,
    `Zpráva pro příjemce: ${data.paymentMessage}`,
    `Detail a QR: ${detailUrl}`,
    `Řetězec QR Platby: ${descriptor}`,
    "Aplikace peníze nepřijímá ani nepřevádí; platba směřuje přímo na uvedený účet.",
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
    <p><img src="cid:payment-qr" width="280" height="280" alt="QR Platba" /></p>
    <p><a href="${escapeHtml(detailUrl)}">Otevřít detail dluhu</a></p>
    <p>Aplikace peníze nepřijímá ani nepřevádí; platba směřuje přímo na uvedený účet.</p>
  `;

  return {
    subject: `Nový předpis: ${data.assessmentTitle}`,
    text,
    html,
    attachments: [
      {
        filename: `qr-platba-${data.variableSymbol}.png`,
        content: qrPng.toString("base64"),
        content_type: "image/png",
        content_id: "payment-qr",
      },
    ],
  };
}
