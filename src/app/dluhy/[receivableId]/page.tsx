import Image from "next/image";
import Link from "next/link";

import { CopyPaymentDetails } from "@/components/copy-payment-details";
import { requireUser } from "@/modules/auth/service";
import { getGuardianReceivable } from "@/modules/assessments/service";
import {
  buildCzechPaymentDescriptor,
  domesticAccountToIban,
  formatCzk,
  paymentQrDataUrl,
} from "@/modules/payments/qr";

export default async function ReceivablePage({
  params,
}: {
  params: Promise<{ receivableId: string }>;
}) {
  const user = await requireUser();
  const { receivableId } = await params;
  const debt = await getGuardianReceivable(user.id, receivableId);
  const payment = {
    accountNumber: debt.accountNumber,
    amountHalere: debt.amountHalere,
    variableSymbol: debt.variableSymbol,
    message: debt.paymentMessage,
  };
  const [qr, descriptor] = await Promise.all([
    paymentQrDataUrl(payment),
    Promise.resolve(buildCzechPaymentDescriptor(payment)),
  ]);
  const amount = formatCzk(debt.amountHalere);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href="/prehled">Zpět na přehled</Link>
      </header>
      <section className="content-stack">
        <div><p className="eyebrow">Detail dluhu</p><h1>{debt.title}</h1></div>
        <article className="panel payment-detail">
          <div className="payment-summary">
            <p><strong>{debt.athleteFirstName} {debt.athleteLastName}</strong></p>
            <p>{debt.clubName} · {debt.teamName ?? "celý klub"}</p>
            <dl>
              <div><dt>Částka</dt><dd>{amount}</dd></div>
              <div><dt>Splatnost</dt><dd>{debt.dueDate}</dd></div>
              <div><dt>Účet</dt><dd>{debt.accountNumber}</dd></div>
              <div><dt>IBAN</dt><dd>{domesticAccountToIban(debt.accountNumber)}</dd></div>
              <div><dt>Variabilní symbol</dt><dd>{debt.variableSymbol}</dd></div>
              <div><dt>Zpráva</dt><dd>{debt.paymentMessage}</dd></div>
            </dl>
            <CopyPaymentDetails accountNumber={debt.accountNumber} amount={(debt.amountHalere / 100).toFixed(2)} variableSymbol={debt.variableSymbol} />
          </div>
          <div className="qr-panel">
            <Image alt="QR Platba" height={320} priority src={qr} unoptimized width={320} />
            <p>Naskenujte bankovní aplikací. Platba směřuje přímo na uvedený účet.</p>
          </div>
        </article>
        <details className="panel technical-details">
          <summary>Technické údaje QR Platby</summary>
          <code>{descriptor}</code>
        </details>
      </section>
    </main>
  );
}
