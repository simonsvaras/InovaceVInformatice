import Link from "next/link";

import {
  reviewJoinRequestAction,
  revokeInvitationAction,
} from "@/app/actions/memberships";
import { JoinCodeForm } from "@/components/join-code-form";
import { MemberInviteForm } from "@/components/member-invite-form";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { getTeamMembershipDashboard } from "@/modules/memberships/service";
import { setTeamBankAccountAction } from "@/app/actions/assessments";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { teamId } = await params;
  const query = await searchParams;
  const team = await getTeamMembershipDashboard(user.id, teamId);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">Klubové platby</Link>
        <Link href="/prehled">Přehled</Link>
      </header>
      <section className="content-stack">
        <div><p className="eyebrow">Správa týmu</p><h1>{team.name}</h1></div>
        <Message error={query.error} success={query.success} />
        <article className="panel">
          <h2>Předpisy a účet týmu</h2>
          <p>Týmový účet je volitelný. Není-li nastaven, předpis použije výchozí účet klubu.</p>
          <div className="button-row">
            <Link className="button-link" href={`/predpisy/novy?teamId=${team.id}`}>Nový týmový předpis</Link>
          </div>
          <form action={setTeamBankAccountAction} className="form-stack inline-form">
            <input name="teamId" type="hidden" value={team.id} />
            <label>
              Český účet týmu
              <input name="accountNumber" placeholder="19-2000145399/0800" required />
            </label>
            <button className="button-secondary" type="submit">Uložit týmový účet</button>
          </form>
        </article>
        <article className="panel">
          <h2>Členové a žádosti</h2>
          {team.pendingRequests.length ? (
            <div className="list-stack">
              {team.pendingRequests.map((request) => (
                <section className="subcard" key={request.id}>
                  <strong>{request.firstName} {request.lastName} ({request.birthYear})</strong>
                  <span>Účet: {request.guardianName} · {request.guardianEmail}</span>
                  <form action={reviewJoinRequestAction} className="button-row">
                    <input name="teamId" type="hidden" value={team.id} />
                    <input name="requestId" type="hidden" value={request.id} />
                    <button name="decision" type="submit" value="approved">Schválit</button>
                    <button className="button-secondary" name="decision" type="submit" value="rejected">Zamítnout</button>
                  </form>
                </section>
              ))}
            </div>
          ) : <p>Žádná žádost nečeká na schválení.</p>}
        </article>
        <article className="panel">
          <h2>Aktivní členové</h2>
          {team.roster.length ? (
            <div className="list-stack">
              {team.roster.map((member) => (
                <section className="subcard" key={member.membershipId}>
                  <strong>{member.firstName} {member.lastName} ({member.birthYear})</strong>
                  <span>Kontakt účtu: {member.guardianName} · {member.guardianEmail}</span>
                </section>
              ))}
            </div>
          ) : <p>Tým zatím nemá aktivní členy.</p>}
        </article>
        <article className="panel">
          <h2>E-mailové pozvánky</h2>
          <p>Každý odkaz je jednorázový, platí 48 hodin a funguje jen s pozvaným e-mailem.</p>
          <MemberInviteForm teamId={team.id} />
          {team.pendingInvitations.length ? (
            <div className="list-stack spaced-section">
              <h3>Aktivní pozvánky</h3>
              {team.pendingInvitations.map((invitation) => (
                <form action={revokeInvitationAction} className="subcard" key={invitation.id}>
                  <input name="teamId" type="hidden" value={team.id} />
                  <input name="invitationId" type="hidden" value={invitation.id} />
                  <span>{invitation.kind === "coach" ? "Trenér" : "Člen"}: {invitation.email}</span>
                  <button className="button-secondary" type="submit">Zrušit pozvánku</button>
                </form>
              ))}
            </div>
          ) : null}
        </article>
        <article className="panel">
          <h2>Sdílený týmový kód</h2>
          <p>Kód neposkytne přístup k datům. Vytvoří pouze žádost, kterou musí trenér nebo správce schválit.</p>
          <JoinCodeForm teamId={team.id} />
        </article>
      </section>
    </main>
  );
}
