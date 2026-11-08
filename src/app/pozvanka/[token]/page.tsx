import Link from "next/link";

import { acceptCoachInvitationAction } from "@/app/actions/clubs";
import { acceptMemberInvitationAction } from "@/app/actions/memberships";
import { AppHeader } from "@/components/app-header";
import { Message } from "@/components/message";
import { AthleteEntryFields } from "@/components/athlete-entry-fields";
import { getCurrentUser } from "@/modules/auth/service";
import { getInvitationPreview } from "@/modules/clubs/service";
import { getOwnAthletes } from "@/modules/memberships/service";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const [user, invitation] = await Promise.all([
    getCurrentUser(),
    getInvitationPreview(token),
  ]);
  const ownAthletes = user ? await getOwnAthletes(user.id) : [];
  const next = `/pozvanka/${encodeURIComponent(token)}`;
  const invalid =
    !invitation ||
    invitation.consumedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date();

  return (
    <div className="auth-page">
      <AppHeader
        context={invitation && !invalid ? {
          kind: "Pozvánka",
          name: invitation.teamName,
          role: invitation.kind === "coach" ? "Trenér" : "Člen / rodič",
        } : undefined}
        guestAction={{
          href: `/prihlaseni?next=${encodeURIComponent(next)}`,
          label: "Přihlásit se",
        }}
        user={user}
      />
      <main className="auth-shell">
        <section className="panel auth-card">
        <p className="eyebrow">Jednorázová pozvánka</p>
        {invalid ? (
          <>
            <h1>Pozvánku nelze použít</h1>
            <p>Odkaz je neplatný, již použitý, zrušený nebo vypršel.</p>
          </>
        ) : invitation.kind === "coach" ? (
          <>
            <h1>Pozvání trenéra</h1>
            <p>Klub <strong>{invitation.clubName}</strong>, tým <strong>{invitation.teamName}</strong>.</p>
            <p>Pozvánka je vázaná na adresu {maskEmail(invitation.email)}.</p>
            <Message error={query.error} />
            {!user ? (
              <div className="button-row">
                <Link className="button-link" href={`/prihlaseni?next=${encodeURIComponent(next)}`}>Přihlásit se</Link>
                <Link className="button-link button-secondary" href={`/registrace?next=${encodeURIComponent(next)}`}>Vytvořit účet</Link>
              </div>
            ) : user.email !== invitation.email ? (
              <p className="message message-error">Jste přihlášeni jiným e-mailem. Odhlaste se a použijte pozvaný účet.</p>
            ) : (
              <form action={acceptCoachInvitationAction} className="form-stack">
                <input name="token" type="hidden" value={token} />
                <button type="submit">Přijmout roli trenéra</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1>Pozvání člena týmu</h1>
            <p>Klub <strong>{invitation.clubName}</strong>, tým <strong>{invitation.teamName}</strong>.</p>
            <p>Pozvánka je vázaná na adresu {maskEmail(invitation.email)} a po použití rovnou aktivuje členství vybraného sportovce.</p>
            <Message error={query.error} />
            {!user ? (
              <div className="button-row">
                <Link className="button-link" href={`/prihlaseni?next=${encodeURIComponent(next)}`}>Přihlásit se</Link>
                <Link className="button-link button-secondary" href={`/registrace?next=${encodeURIComponent(next)}`}>Vytvořit účet</Link>
              </div>
            ) : user.email !== invitation.email ? (
              <p className="message message-error">Jste přihlášeni jiným e-mailem. Pozvánka nesmí být převedena na jiný účet.</p>
            ) : (
              <form action={acceptMemberInvitationAction} className="form-stack">
                <input name="token" type="hidden" value={token} />
                <AthleteEntryFields
                  creationKey={crypto.randomUUID()}
                  displayName={user.displayName}
                  profiles={ownAthletes}
                />
                <button type="submit">Přijmout pozvánku a aktivovat členství</button>
              </form>
            )}
          </>
        )}
        </section>
      </main>
    </div>
  );
}
