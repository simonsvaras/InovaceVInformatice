"use client";

import { useState } from "react";

export function CopyPaymentDetails({
  accountNumber,
  variableSymbol,
  amount,
}: {
  accountNumber: string;
  variableSymbol: string;
  amount: string;
}) {
  const [status, setStatus] = useState("");

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} zkopírován.`);
    } catch {
      setStatus("Kopírování se nepodařilo; údaj označte ručně.");
    }
  }

  return (
    <div className="copy-grid">
      <button className="button-secondary" onClick={() => copy("Účet", accountNumber)} type="button">
        Kopírovat účet
      </button>
      <button className="button-secondary" onClick={() => copy("Variabilní symbol", variableSymbol)} type="button">
        Kopírovat VS
      </button>
      <button className="button-secondary" onClick={() => copy("Částka", amount)} type="button">
        Kopírovat částku
      </button>
      <span aria-live="polite" className="copy-status">{status}</span>
    </div>
  );
}
