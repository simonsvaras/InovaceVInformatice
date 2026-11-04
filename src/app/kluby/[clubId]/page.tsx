import Link from "next/link";

import { createTeamAction, inviteCoachAction } from "@/app/actions/clubs";
import { logoutAction } from "@/app/actions/auth";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getClubAdminDashboard } from "@/modules/clubs/service";

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ error?: string; success?: string; inviteLink?: string }>;
}) {
  const user = await requireUser();
  const { clubId } = await params;
  const query = await searchParams;
  const club = await getClubAdminDashboard(user.id, clubId);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <form action={logoutAction}><button className="button-secondary" type="submit">Odhlásit</button></form>
      </header>
      <section className="content-stack">
        <div>
          <p className="eyebrow">Správa klubu</p>
          <h1>{club.name}</h1>
          <p>IČO {club.ico} · výchozí účet {club.accountNumber}</p>
        </div>
        <Message error={query.error} success={query.success} />
        <article className="panel">
          <h2>Celoklubový předpis</h2>
          <p>Aktivní sportovec dostane jediný dluh, i když je členem více týmů.</p>
          <div className="button-row">
            <Link className="button-link" href={`/predpisy/novy?clubId=${club.id}`}>Nový celoklubový předpis</Link>
            <Link className="button-link button-secondary" href={`/finance?clubId=${club.id}`}>Celoklubové platby</Link>
          </div>
        </article>
        {query.inviteLink ? (
          <article className="panel">
            <h2>Jednorázový odkaz pro trenéra</h2>
            <p>Odkaz platí 48 hodin a lze jej použít pouze jednou účtem se shodným e-mailem.</p>
            <code className="share-code">{query.inviteLink}</code>
          </article>
        ) : null}
        <article className="panel">
          <h2>Týmy</h2>
          <div className="card-grid">
            {club.teams.map((team) => (
              <section className="subcard" key={team.id}>
                <h3><Link href={`/tymy/${team.id}`}>{team.name}</Link></h3>
                <p>{team.coachName ? `Trenér: ${team.coachName} (${team.coachEmail})` : "Trenér zatím není přiřazen."}</p>
                <form action={inviteCoachAction} className="form-stack compact-form">
                  <input name="clubId" type="hidden" value={club.id} />
                  <input name="teamId" type="hidden" value={team.id} />
                  <label>
                    E-mail trenéra
                    <input name="email" required type="email" />
                  </label>
                  {team.coachName ? (
                    <label className="checkbox-label">
                      <input name="replaceExisting" type="checkbox" />
                      Nahradit současného trenéra při přijetí pozvánky
                    </label>
                  ) : null}
                  <button type="submit">Vytvořit pozvánku trenéra</button>
                </form>
              </section>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Nový tým</h2>
          <form action={createTeamAction} className="form-stack inline-form">
            <input name="clubId" type="hidden" value={club.id} />
            <label>
              Název týmu
              <input maxLength={160} name="teamName" required />
            </label>
            <button type="submit">Vytvořit tým</button>
          </form>
        </article>
      </section>
    </main>
  );
}
