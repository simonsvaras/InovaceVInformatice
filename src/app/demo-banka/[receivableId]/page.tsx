import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { simulateBankPaymentAction } from "@/app/actions/bank-simulator";
import { Message } from "@/components/message";
import { InputError } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import { getDemoSimulator } from "@/modules/bank-simulator/service";
import { formatCzk } from "@/modules/payments/qr";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DemoBankPage({
  params,
  searchParams,
}: {
  params: Promise<{ receivableId: string }>;
  searchParams: Promise<{ sourceId?: string; success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { receivableId } = await params;
  const query = await searchParams;
  let debt;
  try {
    debt = await getDemoSimulator(user.id, receivableId);
  } catch (error) {
    if (error instanceof InputError) notFound();
    throw error;
  }
  const sourceId = query.sourceId && UUID.test(query.sourceId) ? query.sourceId : randomUUID();

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href={`/dluhy/${receivableId}`}>Zpět na skutečné platební údaje</Link>
      </header>
      <section className="content-stack narrow-content">
        <div>
          <p className="eyebrow">Oddělený demo bankovní simulátor</p>
          <h1>Simulovat příchozí pohyb</h1>
          <p><strong>Neprobíhá žádný skutečný převod ani spojení s Fio.</strong> Formulář pouze vytvoří trvale označený demo pohyb pro školní ukázku automatické kontroly.</p>
        </div>
        <Message error={query.error} success={query.success} />
        <article className="panel">
          <h2>{debt.title}</h2>
          <p>{debt.athlete_name} · zbývá {formatCzk(debt.remainingHalere)}</p>
          <form action={simulateBankPaymentAction} className="form-stack">
            <input name="receivableId" type="hidden" value={receivableId} />
            <input name="sourceTransactionId" type="hidden" value={sourceId} />
            <label>Cílový účet<input name="account" readOnly value={debt.account_number} /></label>
            <label>Částka v Kč<input defaultValue={(debt.remainingHalere / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
            <label>Variabilní symbol<input defaultValue={debt.variable_symbol} inputMode="numeric" maxLength={10} name="variableSymbol" /></label>
            <p className="form-hint">Demo ID zdroje: <code>{sourceId}</code>. Opakované odeslání se stejným ID nevytvoří druhý pohyb ani alokaci.</p>
            <button type="submit">Simulovat platbu (DEMO)</button>
          </form>
        </article>
        <article className="panel">
          <h2>Co se stane</h2>
          <p>Jednoznačný pohyb se může automaticky zaevidovat. Nejasný VS, jiná částka, již uhrazený dluh nebo možná shoda s ruční evidencí skončí ve frontě oprávněné osoby. Výsledek nikdy není označen jako bankovně ověřený převod.</p>
        </article>
      </section>
    </main>
  );
}
