"use client";

import { useActionState, useState } from "react";

import { createClubAction } from "@/app/actions/clubs";

export function CreateClubForm() {
  const [state, action, pending] = useActionState(createClubAction, {});
  const [clubName, setClubName] = useState("");
  const [ico, setIco] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [teamName, setTeamName] = useState("");

  return (
    <>
      {state.error ? (
        <p className="message message-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="form-stack">
        <label>
          Název klubu
          <input
            maxLength={160}
            name="clubName"
            onChange={(event) => setClubName(event.target.value)}
            required
            value={clubName}
          />
        </label>
        <label>
          IČO
          <input
            inputMode="numeric"
            maxLength={8}
            name="ico"
            onChange={(event) => setIco(event.target.value)}
            required
            value={ico}
          />
        </label>
        <label>
          Výchozí bankovní účet
          <input
            maxLength={32}
            name="accountNumber"
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="123456789/0100"
            required
            value={accountNumber}
          />
          <small>Peníze směřují přímo na tento účet; aplikace je nepřijímá.</small>
        </label>
        <label>
          Název prvního týmu
          <input
            maxLength={160}
            name="teamName"
            onChange={(event) => setTeamName(event.target.value)}
            required
            value={teamName}
          />
        </label>
        <button disabled={pending} type="submit">
          {pending ? "Zakládám klub…" : "Založit klub a tým"}
        </button>
      </form>
    </>
  );
}
