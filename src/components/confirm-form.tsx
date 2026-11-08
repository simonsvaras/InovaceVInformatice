"use client";

import { useState, type ReactNode } from "react";

/**
 * Formulář rizikové akce: tlačítko je neaktivní, dokud uživatel nezaškrtne potvrzení.
 * Server stejně vyžaduje `confirm=yes`, takže jde jen o srozumitelnější ovládání.
 */
export function ConfirmForm({
  action,
  className,
  confirmLabel,
  submit,
  submitClassName,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  confirmLabel: string;
  submit: ReactNode;
  submitClassName?: string;
  children: ReactNode;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={action} className={className}>
      {children}
      <label className="checkbox-label">
        <input
          checked={confirmed}
          name="confirm"
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
          value="yes"
        />
        {confirmLabel}
      </label>
      <button
        className={submitClassName}
        disabled={!confirmed}
        title={confirmed ? undefined : "Nejdřív zaškrtněte potvrzení"}
        type="submit"
      >
        {submit}
      </button>
    </form>
  );
}
