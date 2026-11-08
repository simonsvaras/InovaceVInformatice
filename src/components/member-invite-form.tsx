"use client";

import { useActionState } from "react";

import { inviteMembersAction } from "@/app/actions/memberships";

export function MemberInviteForm({
  initialIdempotencyKey,
  teamId,
}: {
  initialIdempotencyKey: string;
  teamId: string;
}) {
  const [state, action, pending] = useActionState(inviteMembersAction, {});
  const idempotencyKey = state.nextIdempotencyKey ?? initialIdempotencyKey;

  return (
    <div>
      <form action={action} className="form-stack">
        <input name="teamId" type="hidden" value={teamId} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <label>
          E-maily rodičů nebo členů
          <textarea
            name="emails"
            placeholder="rodic1@example.cz&#10;rodic2@example.cz"
            required
            rows={4}
          />
          <small>Oddělte adresy mezerou, čárkou, středníkem nebo novým řádkem. Nejvýše 50.</small>
        </label>
        <button disabled={pending} type="submit">
          {pending ? "Vytvářím pozvánky…" : "Vytvořit e-mailové pozvánky"}
        </button>
      </form>
      {state.error ? <p className="message message-error" role="alert">{state.error}</p> : null}
      {state.warning ? <p className="message message-warning" role="status">{state.warning}</p> : null}
      {state.links?.length ? (
        <div className="message message-success" role="status">
          <strong>Jednorázové odkazy platné 48 hodin</strong>
          <ul className="link-output-list">
            {state.links.map((item) => (
              <li key={item.email}><span>{item.email}</span><code>{item.link}</code></li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
