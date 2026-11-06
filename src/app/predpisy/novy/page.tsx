import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { createAssessmentAction } from "@/app/actions/assessments";
import { AppHeader } from "@/components/app-header";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";
import { todayInPrague } from "@/lib/dates";
import {
  getClubAssessmentForm,
  getTeamAssessmentForm,
} from "@/modules/assessments/service";

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; clubId?: string; error?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  if ((!query.teamId && !query.clubId) || (query.teamId && query.clubId)) notFound();

  const context = query.teamId
    ? await getTeamAssessmentForm(user.id, query.teamId)
    : await getClubAssessmentForm(user.id, query.clubId!);
  const isTeam = Boolean(query.teamId);
  const today = todayInPrague();
  const contextHref = isTeam ? `/tymy/${context.id}` : `/kluby/${context.id}`;
  const financeHref = isTeam
    ? `/finance?teamId=${context.id}`
    : `/finance?clubId=${context.id}`;

  return (
    <main className="dashboard-shell">
      <AppHeader
        backLink={{ href: financeHref, label: "Finance" }}
        context={{
          kind: isTeam ? "Tým" : "Klub",
          name: context.name,
          role: "Správa předpisů",
          href: contextHref,
        }}
        navigation={[
          { href: contextHref, label: "Přehled" },
          { href: financeHref, label: "Finance" },
          { href: "#new-assessment", label: "Nový předpis", active: true },
        ]}
        user={user}
      />
      <section className="content-stack">
        <div id="new-assessment">
          <p className="eyebrow">{isTeam ? "Týmový předpis" : "Celoklubový předpis"}</p>
          <h1>Nový předpis</h1>
          <p>{context.name} · cílový účet {context.accountNumber}</p>
        </div>
        <Message error={query.error} />
        <form action={createAssessmentAction} className="panel form-stack assessment-form">
          <input
            name="clubId"
            type="hidden"
            value={"clubId" in context ? context.clubId : context.id}
          />
          <input name="teamId" type="hidden" value={query.teamId ?? ""} />
          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
          <label>Název předpisu<input maxLength={160} name="title" required /></label>
          <label>Částka v Kč<input inputMode="decimal" name="amount" placeholder="1500,00" required /></label>
          <label>Datum splatnosti<input min={today} name="dueDate" required type="date" /></label>
          <label>Zpráva pro příjemce<input maxLength={60} name="paymentMessage" required /></label>
          {isTeam ? (
            <fieldset className="fieldset">
              <legend>Sportovci</legend>
              <p>Bez zaškrtnutí budou zahrnuti všichni aktivní členové týmu.</p>
              {context.athletes.map((athlete) => (
                <label className="checkbox-label" key={athlete.id}>
                  <input name="athleteId" type="checkbox" value={athlete.id} />
                  {athlete.fullName}{athlete.birthYear ? ` (${athlete.birthYear})` : ""}
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="subcard">
              <strong>{context.athletes.length} unikátních sportovců</strong>
              <span>Sportovec ve více týmech dostane jediný dluh.</span>
            </div>
          )}
          <p>Potvrzením vzniknou jednotlivé dluhy. Aplikace peníze nepřijímá ani nepřevádí.</p>
          <button disabled={!context.athletes.length} type="submit">Vytvořit předpis</button>
        </form>
      </section>
    </main>
  );
}
