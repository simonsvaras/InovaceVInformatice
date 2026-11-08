import { absoluteAppUrl } from "@/modules/notifications/email";
import { formatCzk } from "@/modules/payments/qr";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type MembershipChangeEmailData = {
  kind: "removed" | "moved";
  athleteName: string;
  clubName: string;
  teamName: string;
  targetTeamName?: string;
  openDebtCount: number;
  openDebtHalere: number;
};

export function buildMembershipChangeEmail(data: MembershipChangeEmailData) {
  const subject = data.kind === "removed"
    ? `${data.athleteName} už není členem týmu ${data.teamName}`
    : `${data.athleteName} byl(a) přesunut(a) do týmu ${data.targetTeamName}`;
  const headline = data.kind === "removed"
    ? `${data.athleteName} byl(a) vyřazen(a) z týmu ${data.teamName} (${data.clubName}).`
    : `${data.athleteName} byl(a) přesunut(a) z týmu ${data.teamName} do týmu ${data.targetTeamName} (${data.clubName}).`;
  const debts = data.openDebtCount
    ? `Nezaplacené předpisy zůstávají evidované u původního týmu: ${data.openDebtCount} (${formatCzk(data.openDebtHalere)}). Platební údaje najdete v přehledu.`
    : "U původního týmu nezůstává žádný nezaplacený předpis.";
  const link = absoluteAppUrl("/prehled");
  const text = [headline, "", debts, "", `Přehled: ${link}`].join("\n");
  const html = `<p>${escapeHtml(headline)}</p>
    <p>${escapeHtml(debts)}</p>
    <p><a href="${escapeHtml(link)}">Otevřít přehled</a></p>`;
  return { subject, text, html };
}
