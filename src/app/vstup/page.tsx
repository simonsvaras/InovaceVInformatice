import { requestJoinByCodeAction } from "@/app/actions/memberships";
import { AppHeader } from "@/components/app-header";
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
    <div className="auth-page">
      <AppHeader
        backLink={{ href: "/prehled", label: "Přehled" }}
        context={{ kind: "Tým", name: "Vstup pomocí kódu", role: "Člen / rodič" }}
        user={user}
      />
      <main className="auth-shell">
        <section className="panel auth-card">
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
    </div>
  );
}
