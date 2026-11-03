import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { switchCoachTeamAction } from "@/app/actions/clubs";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getUserContexts } from "@/modules/clubs/service";
import { getGuardianMemberships } from "@/modules/memberships/service";
import { getGuardianReceivables } from "@/modules/assessments/service";
import { formatCzk } from "@/modules/payments/qr";
import { todayInPrague } from "@/lib/dates";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const [contexts, guardianMemberships, receivables, query] = await Promise.all([
    getUserContexts(user.id),
    getGuardianMemberships(user.id),
    getGuardianReceivables(user.id),
    searchParams,
  ]);
  const today = todayInPrague();

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">
          Klubové platby
        </Link>
        <form action={logoutAction}>
          <button className="button-secondary" type="submit">
            Odhlásit
          </button>
        </form>
      </header>
      <section className="content-stack">
        <Message error={query.error} success={query.success} />
        <div>
          <p className="eyebrow">Přihlášený účet</p>
          <h1>Vítejte, {user.displayName}</h1>
          <p>{user.email}</p>
        </div>
        <article className="panel">
          <h2>Začínáme</h2>
          <p>
            Založte klub jako správce, nebo použijte e-mailovou pozvánku či
            týmový kód. Účet a sportovec jsou oddělené záznamy.
          </p>
          <div className="button-row">
            <Link className="button-link" href="/kluby/novy">
              Založit klub
            </Link>
            <Link className="button-link button-secondary" href="/vstup">
              Vstoupit přes kód
            </Link>
          </div>
        </article>
        {contexts.adminClubs.length ? (
          <article className="panel">
            <h2>Spravované kluby</h2>
            <div className="link-list">
              {contexts.adminClubs.map((club) => (
                <Link href={`/kluby/${club.id}`} key={club.id}>{club.name}</Link>
              ))}
            </div>
          </article>
        ) : null}
        {contexts.coachedTeams.length ? (
          <article className="panel">
            <h2>Trenérské týmy</h2>
            <p>Vybraný tým se uloží k účtu pro další přihlášení.</p>
            <div className="card-grid">
              {contexts.coachedTeams.map((team) => (
                <form action={switchCoachTeamAction} className="subcard" key={team.id}>
                  <input name="teamId" type="hidden" value={team.id} />
                  <strong>{team.name}</strong>
                  <span>{team.clubName}</span>
                  <button className={contexts.activeTeamId === team.id ? "" : "button-secondary"} type="submit">
                    {contexts.activeTeamId === team.id ? "Aktivní tým" : "Přepnout na tým"}
                  </button>
                </form>
              ))}
            </div>
          </article>
        ) : null}
        {guardianMemberships.length ? (
          <article className="panel">
            <h2>Moji sportovci</h2>
            <div className="card-grid">
              {guardianMemberships.map((item, index) => (
                <section className="subcard" key={`${item.athleteId}-${item.teamId ?? index}`}>
                  <strong>{item.firstName} {item.lastName} ({item.birthYear})</strong>
                  {item.teamId ? (
                    <>
                      <span>{item.clubName} · {item.teamName}</span>
                      <span>
                        Trenér: {item.coachName ?? "nepřiřazen"}
                        {item.coachEmail ? ` · ${item.coachEmail}` : ""}
                      </span>
                    </>
                  ) : <span>Bez aktivního členství.</span>}
                </section>
              ))}
            </div>
          </article>
        ) : null}
        {receivables.length ? (
          <article className="panel">
            <h2>Dluhy a platební údaje</h2>
            <p>Seřazeno podle nejbližší splatnosti. Platíte přímo na účet klubu nebo týmu.</p>
            <div className="card-grid">
              {receivables.map((debt) => {
                const overdue = debt.dueDate < today;
                return (
                  <section className="subcard" key={debt.id}>
                    <strong>{debt.title}</strong>
                    <span>{debt.athleteFirstName} {debt.athleteLastName}</span>
                    <span>{debt.clubName} · {debt.teamName ?? "celý klub"}</span>
                    <span>{formatCzk(debt.amountHalere)} · splatnost {debt.dueDate}</span>
                    <span className={overdue ? "status-overdue" : "status-open"}>{overdue ? "Po splatnosti" : "K úhradě"}</span>
                    <Link className="button-link" href={`/dluhy/${debt.id}`}>Platební údaje a QR</Link>
                  </section>
                );
              })}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
