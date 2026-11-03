import Link from "next/link";

import { Message } from "@/components/message";
import { retryReceivableDeliveryAction } from "@/app/actions/assessments";
import { formatCzk } from "@/modules/payments/qr";
import { requireUser } from "@/modules/auth/service";
import { getAssessmentManagerView } from "@/modules/assessments/service";

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { assessmentId } = await params;
  const [assessment, query] = await Promise.all([
    getAssessmentManagerView(user.id, assessmentId),
    searchParams,
  ]);
  const back = assessment.teamId ? `/tymy/${assessment.teamId}` : `/kluby/${assessment.clubId}`;

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href={back}>Zpět</Link>
      </header>
      <section className="content-stack">
        <Message error={query.error} success={query.success} />
        <div><p className="eyebrow">Předpis</p><h1>{assessment.title}</h1></div>
        <article className="panel payment-summary">
          <dl>
            <div><dt>Rozsah</dt><dd>{assessment.teamName ?? "Celý klub"}</dd></div>
            <div><dt>Částka</dt><dd>{formatCzk(assessment.amountHalere)}</dd></div>
            <div><dt>Splatnost</dt><dd>{assessment.dueDate}</dd></div>
            <div><dt>Cílový účet</dt><dd>{assessment.accountNumber}</dd></div>
            <div><dt>Zpráva</dt><dd>{assessment.paymentMessage}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <h2>Vzniklé dluhy ({assessment.debts.length})</h2>
          <div className="list-stack">
            {assessment.debts.map((debt) => (
              <section className="subcard" key={debt.id}>
                <strong>{debt.athleteName}</strong>
                <span>VS {debt.variableSymbol} · {debt.guardianEmail}</span>
                <span>Doručení: {debt.deliveryStatus === "sent" ? "odesláno" : "selhalo / není nakonfigurováno"}</span>
                {debt.deliveryError ? <span>Kód: {debt.deliveryError}</span> : null}
                {debt.deliveryStatus !== "sent" ? (
                  <form action={retryReceivableDeliveryAction}>
                    <input name="assessmentId" type="hidden" value={assessment.id} />
                    <input name="receivableId" type="hidden" value={debt.id} />
                    <button className="button-secondary" type="submit">Zkusit doručení znovu</button>
                  </form>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
