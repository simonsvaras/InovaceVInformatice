import Link from "next/link";

import { requestJoinByCodeAction } from "@/app/actions/memberships";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getOwnAthletes } from "@/modules/memberships/service";

export default async function JoinByCodePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const [query, ownAthletes] = await Promise.all([
    searchParams,
    getOwnAthletes(user.id),
  ]);

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <Link className="brand-link" href="/prehled">← Zpět na přehled</Link>
        <p className="eyebrow">Vstup rodiče nebo člena</p>
        <h1>Požádat o vstup kódem</h1>
        <p>Kód nevytvoří členství okamžitě. Žádost musí schválit trenér nebo správce týmu.</p>
        <Message error={query.error} />
        <form action={requestJoinByCodeAction} className="form-stack">
          <label>
            Týmový kód
            <input autoCapitalize="characters" maxLength={9} name="joinCode" placeholder="ABCD-EFGH" required />
          </label>
          <label>
            Sportovec
            <select defaultValue="new" name="athleteChoice">
              <option value="new">Přidat nového sportovce</option>
              {ownAthletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>{athlete.firstName} {athlete.lastName} ({athlete.birthYear})</option>
              ))}
            </select>
            <small>Existujícího sportovce lze vybrat jen z vašeho vlastního účtu.</small>
          </label>
          <fieldset className="fieldset">
            <legend>Údaje nového sportovce</legend>
            <label>Jméno<input maxLength={80} name="firstName" /></label>
            <label>Příjmení<input maxLength={80} name="lastName" /></label>
            <label>Rok narození<input inputMode="numeric" maxLength={4} name="birthYear" /></label>
          </fieldset>
          <button type="submit">Odeslat žádost</button>
        </form>
      </section>
    </main>
  );
}
