import Link from "next/link";

import { requestJoinByCodeAction } from "@/app/actions/memberships";
import { Message } from "@/components/message";
import { AthleteEntryFields } from "@/components/athlete-entry-fields";
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
          <AthleteEntryFields
            creationKey={crypto.randomUUID()}
            displayName={user.displayName}
            profiles={ownAthletes}
          />
          <button type="submit">Odeslat žádost</button>
        </form>
      </section>
    </main>
  );
}
