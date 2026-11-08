"use client";

import { Copy } from "lucide-react";
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
        <span className="icon-label"><Copy aria-hidden="true" size={15} />Kopírovat účet</span>
      </button>
      <button className="button-secondary" onClick={() => copy("Variabilní symbol", variableSymbol)} type="button">
        <span className="icon-label"><Copy aria-hidden="true" size={15} />Kopírovat VS</span>
      </button>
      <button className="button-secondary" onClick={() => copy("Částka", amount)} type="button">
        <span className="icon-label"><Copy aria-hidden="true" size={15} />Kopírovat částku</span>
      </button>
      <span aria-live="polite" className="copy-status">{status}</span>
    </div>
  );
}
