import type { Metadata } from "next";
import { headers } from "next/headers";

import { confirmPublicPaymentAction } from "@/app/actions/public-payments";
import { InputError } from "@/lib/validation";
import { formatCzk } from "@/modules/payments/qr";
import { getPublicPaymentView } from "@/modules/public-payments/service";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Platba | Klubio",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ issueId: string; token: string }>;
  searchParams: Promise<{ changed?: string; error?: string }>;
}) {
  await headers();
  const { issueId, token } = await params;
  const query = await searchParams;
  let payment: Awaited<ReturnType<typeof getPublicPaymentView>> | null = null;
  let loadError: string | null = null;
  try {
    payment = await getPublicPaymentView(issueId, token);
  } catch (error) {
    loadError = error instanceof InputError
      ? error.message
      : "Platební odkaz není dostupný.";
  }

  const allocated = payment?.movementStatus === "allocated";
  const queued = Boolean(payment?.consumedAt && !allocated);
  const displayedAmount = payment?.consumedAt && payment.movementAmountHalere
    ? payment.movementAmountHalere
    : payment?.remainingHalere ?? 0;

  return (
    <main className={styles.shell}>
      <section className={styles.paymentSheet}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">K</span>
            <div>
              <strong>Klubio Pay</strong>
              <span>Platební brána</span>
            </div>
          </div>
          <span className={styles.secureBadge}><span aria-hidden="true">●</span> Zabezpečeno</span>
        </header>

        {loadError || !payment ? (
          <div className={styles.body}>
            <h1>Platbu nelze otevřít</h1>
            <p>{loadError ?? "Platební odkaz není dostupný."}</p>
          </div>
        ) : (
          <>
            <div className={styles.amountPanel}>
              <p className={styles.prompt}>{payment.consumedAt ? "Potvrzená částka" : "Platíte"}</p>
              <h1 className={styles.amount}>{formatCzk(displayedAmount)}</h1>
              <p className={styles.amountCaption}>Příspěvek na účet klubu</p>
            </div>

            <div className={styles.body}>
              <div className={styles.sectionHeading}>
                <h2>Platební údaje</h2>
                <span>Vyplněno automaticky</span>
              </div>
              <dl className={styles.details}>
                <div><dt>Na účet</dt><dd>{payment.accountNumber}</dd></div>
                <div><dt>Variabilní symbol</dt><dd>{payment.variableSymbol}</dd></div>
                <div><dt>Zpráva pro příjemce</dt><dd>{payment.paymentMessage}</dd></div>
              </dl>

              {!payment.consumedAt && payment.remainingHalere > 0 ? (
                <form action={confirmPublicPaymentAction} className={styles.form}>
                  <input name="issueId" type="hidden" value={issueId} />
                  <input name="token" type="hidden" value={token} />
                  <input name="expectedAmountHalere" type="hidden" value={payment.remainingHalere} />
                  <button className={styles.payButton} type="submit">Potvrdit platbu <span aria-hidden="true">›</span></button>
                  <p className={styles.formHint}>Částku ani platební údaje nelze na této stránce změnit.</p>
                </form>
              ) : null}
            </div>

            {query.changed ? (
              <p className={styles.warning}>Zbývající částka se změnila. Zkontrolujte ji a potvrďte platbu znovu.</p>
            ) : null}
            {query.error ? <p className={styles.error}>{query.error}</p> : null}
            {allocated ? (
              <p className={styles.notice}><strong>Platební požadavek byl přijat.</strong><span>Údaje byly automaticky přiřazeny k předpisu.</span></p>
            ) : null}
            {queued ? (
              <p className={styles.warning}><strong>Požadavek kontrolujeme.</strong><span>Čeká na ověření platebních údajů.</span></p>
            ) : null}
            {!payment.consumedAt && payment.remainingHalere <= 0 ? (
              <p className={styles.warning}>Dluh už nemá částku, kterou by bylo možné tímto odkazem potvrdit.</p>
            ) : null}
          </>
        )}

        <footer className={styles.footer}>
          <span className={styles.footerMark}>K</span>
          <span>Klubio Pay</span>
          <span className={styles.footerDivider} aria-hidden="true" />
          <span>Soukromý platební odkaz</span>
        </footer>
      </section>
    </main>
  );
}
