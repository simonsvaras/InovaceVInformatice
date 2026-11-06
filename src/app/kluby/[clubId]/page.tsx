import Link from "next/link";

import { inviteCoachAction } from "@/app/actions/clubs";
import { AppHeader } from "@/components/app-header";
import { CreateTeamModal } from "@/components/create-team-modal";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getClubAdminDashboard } from "@/modules/clubs/service";

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
    inviteLink?: string;
  }>;
}) {
  const user = await requireUser();
  const { clubId } = await params;
  const query = await searchParams;
  const club = await getClubAdminDashboard(user.id, clubId);
  const teamsWithCoach = club.teams.filter((team) => team.coachName).length;

  return (
    <main className="dashboard-shell dashboard-home club-admin-page">
      <AppHeader
        context={{
          kind: "Klub",
          name: club.name,
          role: "Správce klubu",
          href: `/kluby/${club.id}`,
        }}
        navigation={[
          { href: `/kluby/${club.id}`, label: "Přehled klubu", active: true },
          { href: `#teams-title`, label: "Týmy" },
          { href: `/finance?clubId=${club.id}`, label: "Finance" },
        ]}
        primaryAction={{
          href: `/predpisy/novy?clubId=${club.id}`,
          label: "Nový předpis",
        }}
        user={user}
      />

      <section className="club-admin-content">
        <Message error={query.error} success={query.success} />

        <header className="club-admin-hero">
          <div>
            <p className="club-admin-role">Správa klubu</p>
            <h1>{club.name}</h1>
            <p className="club-admin-intro">
              Týmy, trenéři a klubové finance na jednom místě.
            </p>
          </div>

          <CreateTeamModal clubId={club.id} />
        </header>

        <section className="club-summary" aria-label="Souhrn klubu">
          <div className="club-summary-item">
            <span>Aktivní týmy</span>
            <strong>{club.teams.length}</strong>
          </div>
          <div className="club-summary-item">
            <span>Týmy s trenérem</span>
            <strong>{teamsWithCoach}</strong>
            <small>z {club.teams.length} aktivních týmů</small>
          </div>
          <div className="club-summary-item">
            <span>IČO</span>
            <strong className="club-summary-text">{club.ico}</strong>
          </div>
          <div className="club-summary-item">
            <span>Výchozí účet</span>
            <strong className="club-summary-text">
              {club.accountNumber || "Nenastaven"}
            </strong>
          </div>
        </section>

        <nav className="club-finance-actions" aria-label="Klubové finance">
          <div>
            <strong>Klubové finance</strong>
            <span>Předpisy pro celý klub a přehled evidovaných plateb.</span>
          </div>
          <div className="club-finance-links">
            <Link
              className="club-secondary-action"
              href={`/finance?clubId=${club.id}`}
            >
              Zobrazit platby
            </Link>
            <Link
              className="club-primary-action"
              href={`/predpisy/novy?clubId=${club.id}`}
            >
              Nový předpis
            </Link>
          </div>
        </nav>

        {query.inviteLink ? (
          <article className="club-invite-result">
            <div>
              <h2>Jednorázový odkaz pro trenéra</h2>
              <p>
                Platí 48 hodin a může jej použít pouze účet se shodným
                e-mailem.
              </p>
            </div>
            <code className="share-code">{query.inviteLink}</code>
          </article>
        ) : null}

        <section className="club-teams-section" aria-labelledby="teams-title">
          <div className="club-section-heading">
            <div>
              <h2 id="teams-title">Týmy</h2>
              <p>
                Otevřete tým pro správu členů, pozvánek, předpisů a plateb.
              </p>
            </div>
            <span>
              {club.teams.length} {club.teams.length === 1 ? "tým" : "týmů"}
            </span>
          </div>

          <div className="club-team-grid">
            {club.teams.map((team) => (
              <article className="club-team-card" key={team.id}>
                <header className="club-team-card-header">
                  <div>
                    <span>Tým</span>
                    <h3>
                      <Link href={`/tymy/${team.id}`}>{team.name}</Link>
                    </h3>
                  </div>
                  <Link className="club-team-open" href={`/tymy/${team.id}`}>
                    Otevřít tým
                  </Link>
                </header>

                <div className="club-coach-block">
                  <span className="club-coach-label">Trenér týmu</span>
                  {team.coachName ? (
                    <div className="club-coach-person">
                      <span className="club-coach-avatar" aria-hidden="true">
                        {team.coachName.slice(0, 1).toLocaleUpperCase("cs")}
                      </span>
                      <span>
                        <strong>{team.coachName}</strong>
                        <small>{team.coachEmail}</small>
                      </span>
                    </div>
                  ) : (
                    <p>Trenér zatím není přiřazen.</p>
                  )}
                </div>

                <form action={inviteCoachAction} className="club-coach-form">
                  <input name="clubId" type="hidden" value={club.id} />
                  <input name="teamId" type="hidden" value={team.id} />
                  <label>
                    {team.coachName ? "E-mail nového trenéra" : "E-mail trenéra"}
                    <input
                      name="email"
                      placeholder="trener@example.cz"
                      required
                      type="email"
                    />
                  </label>
                  {team.coachName ? (
                    <label className="checkbox-label">
                      <input name="replaceExisting" type="checkbox" />
                      Nahradit současného trenéra po přijetí pozvánky
                    </label>
                  ) : null}
                  <button type="submit">
                    {team.coachName ? "Pozvat nového trenéra" : "Pozvat trenéra"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>

      </section>
    </main>
  );
}
