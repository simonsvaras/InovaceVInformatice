import Image from "next/image";
import Link from "next/link";

import {
  reportManualPaymentAction,
  withdrawManualPaymentAction,
} from "@/app/actions/payments";
import { CopyPaymentDetails } from "@/components/copy-payment-details";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getGuardianReceivable } from "@/modules/assessments/service";
import {
  buildCzechPaymentDescriptor,
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
  const payment = {
    accountNumber: debt.accountNumber,
    amountHalere: debt.remainingHalere,
    variableSymbol: debt.variableSymbol,
    message: debt.paymentMessage,
  };
  const [qr, descriptor] = debt.remainingHalere > 0
    ? await Promise.all([
        paymentQrDataUrl(payment),
        Promise.resolve(buildCzechPaymentDescriptor(payment)),
      ])
    : [null, null];
  const amount = formatCzk(debt.amountHalere);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href="/prehled">Zpět na přehled</Link>
      </header>
      <section className="content-stack">
        <Message error={query.error} success={query.success} />
        <div><p className="eyebrow">Detail dluhu</p><h1>{debt.title}</h1></div>
        <article className="panel payment-detail">
          <div className="payment-summary">
            <p><strong>{debt.athleteFirstName} {debt.athleteLastName}</strong></p>
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
                <Image alt="QR Platba" height={320} priority src={qr} unoptimized width={320} />
                <p>Naskenujte bankovní aplikací. Platba zbývající částky směřuje přímo na uvedený účet.</p>
              </>
            ) : <p>Dluh je podle evidovaných platebních událostí uhrazen.</p>}
            {debt.demoIntegrationEnabled && debt.remainingHalere > 0 ? (
              <div className="demo-simulator-entry">
                <p><strong>Školní demo automatické kontroly</strong></p>
                <p>Jde o oddělenou simulaci. Nevytváří skutečný převod, nemění QR a není spojením s Fio.</p>
                <Link className="button-link button-secondary" href={`/demo-banka/${debt.id}`}>Simulovat platbu (DEMO)</Link>
              </div>
            ) : debt.remainingHalere > 0 ? (
              <p>Ruční hlášení „Zaplatil jsem“ zůstává dostupné nezávisle na technické konfiguraci demo kontroly.</p>
            ) : null}
          </div>
        </article>
        {debt.hasSimulatedPayment ? (
          <article className="panel">
            <h2>Demo automatická kontrola</h2>
            <p>Část evidované úhrady pochází ze simulovaného pohybu (<code>simulated</code>). Nejde o potvrzení skutečného ani bankovně ověřeného převodu a aplikace není spojena s Fio.</p>
          </article>
        ) : null}
        {debt.pendingClaimId ? (
          <article className="panel">
            <h2>Hlášení o odeslané platbě</h2>
            <p><strong>{formatCzk(debt.pendingClaimAmountHalere ?? 0)}</strong> čeká na potvrzení. Jde pouze o vaše hlášení, nikoli bankovně ověřený převod.</p>
            <form action={withdrawManualPaymentAction}>
              <input name="receivableId" type="hidden" value={debt.id} />
              <input name="claimId" type="hidden" value={debt.pendingClaimId} />
              <button className="button-secondary" type="submit">Odvolat hlášení</button>
            </form>
          </article>
        ) : debt.remainingHalere > 0 ? (
          <article className="panel">
            <h2>Zaplatil jsem</h2>
            <p>Nahlaste částku, kterou jste odeslali. Hlášení čeká na vyřízení trenérem či správcem; samo nepotvrzuje, že klub peníze přijal, a není bankovně ověřeným převodem.</p>
            <form action={reportManualPaymentAction} className="form-stack inline-form">
              <input name="receivableId" type="hidden" value={debt.id} />
              <label>Částka v Kč<input defaultValue={(debt.remainingHalere / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
              <button type="submit">Zaplatil jsem</button>
            </form>
          </article>
        ) : null}
        {descriptor ? (
          <details className="panel technical-details">
            <summary>Technické údaje QR Platby</summary>
            <code>{descriptor}</code>
          </details>
        ) : null}
      </section>
    </main>
  );
}
