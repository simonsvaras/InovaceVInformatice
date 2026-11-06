export type FioMovement = {
  sourceTransactionId: string;
  amountHalere: number;
  currency: string;
  variableSymbol: string | null;
  occurredAt: Date;
  counterAccount: string | null;
  counterBankCode: string | null;
  counterpartyName: string | null;
  recipientMessage: string | null;
  transactionType: string | null;
};

export type FioPeriod = {
  accountId: string;
  bankId: string;
  currency: string;
  iban: string;
  movements: FioMovement[];
};

export class FioApiError extends Error {
  constructor(
    readonly code: "cooldown" | "invalid_token" | "history_locked" | "unavailable" | "invalid_response",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

type FioColumn = { value?: unknown } | null | undefined;
type FioTransaction = Record<string, FioColumn>;

function column(transaction: FioTransaction, key: string) {
  return transaction[key]?.value;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function parseFioDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const calendarDate = value.match(/^(\d{4}-\d{2}-\d{2})/i)?.[1];
    if (calendarDate) {
      const date = new Date(`${calendarDate}T12:00:00.000Z`);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function parseMovement(transaction: FioTransaction, accountCurrency: string): FioMovement {
  const id = optionalText(column(transaction, "column22"), 80);
  const amount = Number(column(transaction, "column1"));
  const occurredAt = parseFioDate(column(transaction, "column0"));
  const currency = optionalText(column(transaction, "column14"), 3)?.toUpperCase() ?? accountCurrency;
  if (!id || !Number.isFinite(amount) || !occurredAt || !currency) {
    throw new FioApiError("invalid_response", "Fio vrátilo neúplný pohyb.", false);
  }
  const amountHalere = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountHalere) || amountHalere === 0) {
    throw new FioApiError("invalid_response", "Fio vrátilo neplatnou částku pohybu.", false);
  }
  const rawVs = optionalText(column(transaction, "column5"), 10);
  return {
    sourceTransactionId: id,
    amountHalere,
    currency,
    variableSymbol: rawVs && /^\d{1,10}$/.test(rawVs) ? rawVs : null,
    occurredAt,
    counterAccount: optionalText(column(transaction, "column2"), 64),
    counterBankCode: optionalText(column(transaction, "column3"), 10),
    counterpartyName: optionalText(column(transaction, "column10"), 255),
    recipientMessage: optionalText(column(transaction, "column16"), 255),
    transactionType: optionalText(column(transaction, "column8"), 255),
  };
}

export async function readFioPeriod(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<FioPeriod> {
  const endpoint = new URL(
    `/v1/rest/periods/${encodeURIComponent(token)}/${dateFrom}/${dateTo}/transactions.json`,
    "https://fioapi.fio.cz",
  );
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new FioApiError("unavailable", "Fio API je dočasně nedostupné.", true);
  }
  if (response.status === 409) {
    throw new FioApiError("cooldown", "Fio vyžaduje alespoň 30 sekund mezi voláními stejného tokenu.", true);
  }
  if (response.status === 500) {
    throw new FioApiError(
      "invalid_token",
      "Token je neplatný, neaktivní nebo ještě není připravený. Nový token může začít fungovat až za pět minut.",
      false,
    );
  }
  if (response.status === 422) {
    throw new FioApiError(
      "history_locked",
      "Požadované období je starší než 90 dní a ve Fio vyžaduje dodatečné odemknutí historie.",
      false,
    );
  }
  if (!response.ok) {
    throw new FioApiError("unavailable", `Fio API odpovědělo stavem ${response.status}.`, response.status >= 500);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FioApiError("invalid_response", "Fio vrátilo nečitelnou odpověď.", false);
  }
  const statement = (payload as {
    accountStatement?: {
      info?: Record<string, unknown>;
      transactionList?: { transaction?: FioTransaction[] | FioTransaction | null };
    };
  }).accountStatement;
  const info = statement?.info;
  if (!info) throw new FioApiError("invalid_response", "Fio odpověď neobsahuje údaje účtu.", false);
  const accountId = optionalText(info.accountId, 64);
  const bankId = optionalText(info.bankId, 10);
  const currency = optionalText(info.currency, 3)?.toUpperCase();
  const iban = optionalText(info.iban, 34)?.replace(/\s/g, "").toUpperCase();
  if (!accountId || !bankId || !currency || !iban) {
    throw new FioApiError("invalid_response", "Fio odpověď neobsahuje úplnou identitu účtu.", false);
  }
  const rawTransactions = statement.transactionList?.transaction;
  const transactions = !rawTransactions
    ? []
    : Array.isArray(rawTransactions)
      ? rawTransactions
      : [rawTransactions];
  return {
    accountId,
    bankId,
    currency,
    iban,
    movements: transactions.map((transaction) => parseMovement(transaction, currency)),
  };
}
