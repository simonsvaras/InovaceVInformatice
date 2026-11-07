import Image from "next/image";

import {
  reportManualPaymentAction,
  withdrawManualPaymentAction,
} from "@/app/actions/payments";
import { AppHeader } from "@/components/app-header";
import { CopyPaymentDetails } from "@/components/copy-payment-details";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getGuardianReceivable } from "@/modules/assessments/service";
import {
  domesticAccountToIban,
  formatCzk,
  paymentQrDataUrl,
} from "@/modules/payments/qr";
import { debtStatusLabel } from "@/modules/payments/status";

export default async function ReceivablePage({
  params,
  searchParams,
}: {
  params: Promise<{ receivableId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { receivableId } = await params;
  const query = await searchParams;
  const debt = await getGuardianReceivable(user.id, receivableId);
  const qr = debt.remainingHalere > 0
    ? await paymentQrDataUrl({
        accountNumber: debt.accountNumber,
        amountHalere: debt.remainingHalere,
        variableSymbol: debt.variableSymbol,
        message: debt.paymentMessage,
      })
    : null;
  const amount = formatCzk(debt.amountHalere);

  return (
    <main className="dashboard-shell">
      <AppHeader
        backLink={{ href: "/prehled", label: "Přehled" }}
        context={{
          kind: debt.teamName ? "Tým" : "Klub",
          name: debt.teamName ?? debt.clubName,
          role: "Člen / rodič",
          href: debt.teamId ? `/tymy/${debt.teamId}?view=member` : "/prehled",
        }}
        navigation={[
          ...(debt.teamId
            ? [{ href: `/tymy/${debt.teamId}?view=member`, label: "Přehled týmu" }]
            : [{ href: "/prehled", label: "Moje kluby" }]),
          { href: `/dluhy/${debt.id}`, label: "Platební údaje", active: true },
        ]}
        user={user}
      />
      <section className="content-stack">
        <Message error={query.error} success={query.success} />
        <div><p className="eyebrow">Detail dluhu</p><h1>{debt.title}</h1></div>
        <article className="panel payment-detail">
          <div className="payment-summary">
            <p><strong>{debt.athleteName}</strong></p>
            <p>{debt.clubName} · {debt.teamName ?? "celý klub"}</p>
            <dl>
              <div><dt>Částka</dt><dd>{amount}</dd></div>
              <div><dt>Evidováno</dt><dd>{formatCzk(debt.allocatedHalere)}</dd></div>
              <div><dt>Zbývá</dt><dd>{formatCzk(debt.remainingHalere)}</dd></div>
              <div><dt>Stav</dt><dd>{debtStatusLabel(debt.status)}</dd></div>
              <div><dt>Splatnost</dt><dd>{debt.dueDate}</dd></div>
              <div><dt>Účet</dt><dd>{debt.accountNumber}</dd></div>
              <div><dt>IBAN</dt><dd>{domesticAccountToIban(debt.accountNumber)}</dd></div>
              <div><dt>Variabilní symbol</dt><dd>{debt.variableSymbol}</dd></div>
              <div><dt>Zpráva</dt><dd>{debt.paymentMessage}</dd></div>
            </dl>
            {debt.remainingHalere > 0 ? (
              <CopyPaymentDetails accountNumber={debt.accountNumber} amount={(debt.remainingHalere / 100).toFixed(2)} variableSymbol={debt.variableSymbol} />
            ) : null}
          </div>
          <div className="qr-panel">
            {qr ? (
              <>
                <Image alt="Standardní česká QR Platba s účtem, částkou a variabilním symbolem" height={320} priority src={qr} unoptimized width={320} />
                <p>Naskenujte QR v bankovní aplikaci. Obsahuje účet, aktuální zbývající částku, variabilní symbol a zprávu.</p>
              </>
            ) : <p>Dluh je podle evidovaných platebních událostí uhrazen.</p>}
          </div>
        </article>
        {debt.hasSimulatedPayment ? (
          <article className="panel">
            <h2>Zdroj úhrady</h2>
            <p>Simulovaný pohyb</p>
          </article>
        ) : null}
        {debt.hasFioPayment ? (
          <article className="panel">
            <h2>Automatická kontrola banky</h2>
            <p>Část evidované úhrady byla načtena z Fio API a spárována podle účtu, variabilního symbolu a částky.</p>
          </article>
        ) : debt.fioIntegrationEnabled && debt.remainingHalere > 0 ? (
          <article className="panel">
            <h2>Automatická kontrola banky</h2>
            <p>Příchozí pohyby se průběžně kontrolují.</p>
          </article>
        ) : null}
        {debt.pendingClaimId ? (
          <article className="panel">
            <h2>Hlášení o odeslané platbě</h2>
            <p><strong>{formatCzk(debt.pendingClaimAmountHalere ?? 0)}</strong> čeká na potvrzení.</p>
            <form action={withdrawManualPaymentAction}>
              <input name="receivableId" type="hidden" value={debt.id} />
              <input name="claimId" type="hidden" value={debt.pendingClaimId} />
              <button className="button-secondary" type="submit">Odvolat hlášení</button>
            </form>
          </article>
        ) : debt.remainingHalere > 0 ? (
          <article className="panel">
            <h2>Zaplatil jsem</h2>
            <p>Nahlaste částku, kterou jste odeslali.</p>
            <form action={reportManualPaymentAction} className="form-stack inline-form">
              <input name="receivableId" type="hidden" value={debt.id} />
              <label>Částka v Kč<input defaultValue={(debt.remainingHalere / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
              <button type="submit">Zaplatil jsem</button>
            </form>
          </article>
        ) : null}
      </section>
    </main>
  );
}
