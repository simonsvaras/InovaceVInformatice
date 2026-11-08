"use client";

import { useState } from "react";

export function RestoreTeamForm({
  action,
  clubId,
  teamId,
  restorableMembers,
}: {
  action: (formData: FormData) => void | Promise<void>;
  clubId: string;
  teamId: string;
  restorableMembers: number;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [withMembers, setWithMembers] = useState(true);

  return (
    <form action={action} className="club-coach-form">
      <input name="clubId" type="hidden" value={clubId} />
      <input name="teamId" type="hidden" value={teamId} />
      <p>
        Tým se vrátí mezi aktivní týmy. Pozvánky, týmový kód a zamítnuté žádosti se
        neobnovují, vytvořte je znovu.
      </p>
      <label className="checkbox-label">
        <input
          checked={confirmed}
          name="confirm"
          onChange={(event) => setConfirmed(event.target.checked)}
          required
          type="checkbox"
          value="yes"
        />
        Potvrzuji obnovení týmu
      </label>
      {restorableMembers > 0 ? (
        <label className={`checkbox-label restore-sub-option${confirmed ? "" : " is-disabled"}`}>
          <input
            checked={confirmed && withMembers}
            disabled={!confirmed}
            name="restoreMembers"
            onChange={(event) => setWithMembers(event.target.checked)}
            type="checkbox"
            value="yes"
          />
          Obnovit i členy odhlášené archivací ({restorableMembers})
        </label>
      ) : (
        <p className="restore-sub-note">Archivací nebyl odhlášen žádný člen, který by šel obnovit.</p>
      )}
      <button className="club-secondary-action" type="submit">
        {confirmed && restorableMembers > 0 && !withMembers ? "Obnovit tým bez členů" : "Obnovit tým"}
      </button>
    </form>
  );
}
