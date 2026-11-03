"use client";

import { useActionState } from "react";

import { generateJoinCodeAction } from "@/app/actions/memberships";

export function JoinCodeForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState(generateJoinCodeAction, {});

  return (
    <div>
      <form action={action}>
        <input name="teamId" type="hidden" value={teamId} />
        <button className="button-secondary" disabled={pending} type="submit">
          {pending ? "Generuji…" : "Vygenerovat nový týmový kód"}
        </button>
      </form>
      {state.error ? <p className="message message-error" role="alert">{state.error}</p> : null}
      {state.code ? (
        <div className="message message-success" role="status">
          <strong>Nový kód: <code className="large-code">{state.code}</code></strong>
          <p>Starší kód byl zrušen. Nový kód platí 30 dní a vytvoří pouze žádost ke schválení.</p>
        </div>
      ) : null}
    </div>
  );
}
