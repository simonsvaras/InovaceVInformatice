import { formatCzk } from "@/modules/payments/qr";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type FioPaymentEmailData = {
  athleteName: string;
  assessmentTitle: string;
  clubName: string;
  teamName: string | null;
  amountHalere: number;
};

export function buildFioPaymentEmail(data: FioPaymentEmailData) {
  const scope = data.teamName ? `${data.clubName} · ${data.teamName}` : data.clubName;
  const subject = `Příchozí platba spárována – ${data.assessmentTitle}`;
  const text = [
    "Na bankovním účtu byl nalezen příchozí pohyb a aplikace jej spárovala s předpisem.",
    "Aplikace peníze nepřijímá ani nepřevádí; eviduje údaj načtený z Fio API.",
    "",
    `Sportovec: ${data.athleteName}`,
    `Předpis: ${data.assessmentTitle}`,
    `Klub / tým: ${scope}`,
    `Částka: ${formatCzk(data.amountHalere)}`,
    "Zdroj evidence: Fio API.",
  ].join("\n");
  const html = `<p>Na bankovním účtu byl nalezen příchozí pohyb a aplikace jej spárovala s předpisem.</p>
    <p>Aplikace peníze nepřijímá ani nepřevádí; eviduje údaj načtený z Fio API.</p>
    <ul>
      <li>Sportovec: ${escapeHtml(data.athleteName)}</li>
      <li>Předpis: ${escapeHtml(data.assessmentTitle)}</li>
      <li>Klub / tým: ${escapeHtml(scope)}</li>
      <li>Částka: ${escapeHtml(formatCzk(data.amountHalere))}</li>
      <li>Zdroj evidence: Fio API</li>
    </ul>`;
  return { subject, text, html };
}
