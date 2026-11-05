"use client";

import { useRef } from "react";

import { createTeamAction } from "@/app/actions/clubs";

export function CreateTeamModal({ clubId }: { clubId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button className="club-primary-action" onClick={openDialog} type="button">
        Přidat tým
      </button>

      <dialog className="club-team-dialog" ref={dialogRef}>
        <form action={createTeamAction} className="club-team-dialog-form">
          <input name="clubId" type="hidden" value={clubId} />

          <header className="club-team-dialog-header">
            <div>
              <h2>Nový tým</h2>
              <p>Zadejte název. Trenéra a členy přidáte v dalším kroku.</p>
            </div>
            <button
              aria-label="Zavřít dialog"
              className="club-dialog-close"
              onClick={closeDialog}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="club-team-dialog-content">
            <label>
              Název týmu
              <input
                autoFocus
                maxLength={160}
                name="teamName"
                placeholder="Například Mladší žáci"
                required
              />
            </label>
          </div>

          <footer className="club-team-dialog-actions">
            <button
              className="button-secondary"
              onClick={closeDialog}
              type="button"
            >
              Zrušit
            </button>
            <button type="submit">Vytvořit tým</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
