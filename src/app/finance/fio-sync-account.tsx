"use client";

import { useRef } from "react";

import {
  disableFioIntegrationAction,
  requestFioSyncAction,
  verifyAndActivateFioAction,
} from "@/app/actions/fio";

type Scope = { teamId?: string; clubId?: string };

type Account = {
  id: string;
  accountNumber: string;
  isDefault: boolean;
  exclusiveTeamId: string | null;
  canConfigure: boolean;
  canReadRaw: boolean;
  fioIntegrationId: string | null;
  fioStatus: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastNewMovementAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

function ScopeFields({ scope }: { scope: Scope }) {
  return (
    <>
      <input name="teamId" type="hidden" value={scope.teamId ?? ""} />
      <input name="clubId" type="hidden" value={scope.clubId ?? ""} />
    </>
  );
}

function formatTime(value: string | null) {
  if (!value) return "zatím neproběhla";
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (status === "active") return "Spojení aktivní";
  if (status === "requires_token") return "Je nutný nový token";
  if (status === "intervention") return "Vyžaduje zásah";
  if (status === "disabled") return "Synchronizace vypnutá";
  return "Není aktivováno";
}

export function FioSyncAccount({ account, scope }: { account: Account; scope: Scope }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isActive = account.fioStatus === "active";
  const hasIntegration = Boolean(account.fioIntegrationId);
  const hasUsableConfiguration = hasIntegration && account.fioStatus !== "disabled";

  return (
    <div className="finance-sync-account fio-account-card">
      <div className="finance-sync-account-copy">
        <div className="finance-sync-account-title">
          <strong>{account.accountNumber}</strong>
          <span className={isActive ? "is-active" : account.fioStatus ? "is-warning" : ""}>
            {statusLabel(account.fioStatus)}
          </span>
        </div>
        <p>
          {account.isDefault
            ? "Výchozí sdílený účet klubu"
            : account.exclusiveTeamId
              ? "Výhradní týmový účet"
              : "Sdílený klubový účet"}
        </p>
        {hasIntegration ? (
          <dl className="fio-sync-timeline">
            <div><dt>Poslední pokus</dt><dd>{formatTime(account.lastAttemptAt)}</dd></div>
            <div><dt>Poslední úspěch</dt><dd>{formatTime(account.lastSuccessAt)}</dd></div>
            <div><dt>Nový pohyb</dt><dd>{formatTime(account.lastNewMovementAt)}</dd></div>
          </dl>
        ) : null}
        {account.lastErrorMessage ? (
          <p className="fio-sync-error" role="status">
            <strong>Poslední chyba:</strong> {account.lastErrorMessage}
            {account.lastErrorCode ? <small>Kód: {account.lastErrorCode}</small> : null}
          </p>
        ) : null}
      </div>

      <div className="fio-sync-actions">
        {account.canConfigure ? (
          <button type="button" onClick={() => dialogRef.current?.showModal()}>
            {hasUsableConfiguration ? "Nahradit token" : "Aktivovat automatickou synchronizaci"}
          </button>
        ) : null}
        {isActive && account.canConfigure ? (
          <form action={requestFioSyncAction}>
            <ScopeFields scope={scope} />
            <input name="bankAccountId" type="hidden" value={account.id} />
            <button className="button-secondary" type="submit">Synchronizovat nyní</button>
          </form>
        ) : null}
        {hasIntegration && account.canConfigure && account.fioStatus !== "disabled" ? (
          <form action={disableFioIntegrationAction}>
            <ScopeFields scope={scope} />
            <input name="bankAccountId" type="hidden" value={account.id} />
            <button className="button-text-danger" type="submit">Vypnout synchronizaci</button>
          </form>
        ) : null}
      </div>

      <dialog className="fio-activation-dialog" ref={dialogRef}>
        <form action={verifyAndActivateFioAction} className="fio-activation-form">
          <ScopeFields scope={scope} />
          <input name="bankAccountId" type="hidden" value={account.id} />
          <header>
            <div>
              <p>Účet {account.accountNumber}</p>
              <h2>{hasUsableConfiguration ? "Nahradit Fio token" : "Aktivovat automatickou synchronizaci"}</h2>
            </div>
            <button
              aria-label="Zavřít"
              className="fio-dialog-close"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >×</button>
          </header>
          <div className="fio-activation-body">
            <label>
              Banka
              <select name="bank" defaultValue="fio" disabled>
                <option value="fio">Fio banka (2010)</option>
              </select>
            </label>
            <div className="fio-token-guide">
              <strong>Jak připravit token</strong>
              <ol>
                <li>Ve Fio internetbankingu otevřete Nastavení → API.</li>
                <li>Vytvořte token s oprávněním „Sledování účtu“ pro tento CZK účet.</li>
                <li>Token vložte níže. Nový token může začít fungovat až za pět minut.</li>
              </ol>
            </div>
            <label>
              Fio API token
              <input
                autoComplete="off"
                inputMode="text"
                maxLength={64}
                minLength={64}
                name="token"
                required
                spellCheck={false}
                type="password"
              />
            </label>
          </div>
          <footer>
            <button className="button-secondary" onClick={() => dialogRef.current?.close()} type="button">Zrušit</button>
            <button type="submit">Ověřit a aktivovat</button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
