const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InputError";
  }
}

export function formText(formData: FormData, field: string): string {
  const value = formData.get(field);

  if (typeof value !== "string") {
    throw new InputError("invalid_form", "Formulář není úplný.");
  }

  return value.trim();
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("cs-CZ");

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new InputError("invalid_email", "Zadejte platnou e-mailovou adresu.");
  }

  return email;
}

export function validateDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ");

  if (displayName.length < 2 || displayName.length > 120) {
    throw new InputError(
      "invalid_name",
      "Jméno musí mít 2 až 120 znaků.",
    );
  }

  return displayName;
}

export function validatePassword(value: string): string {
  if (value.length < 12 || value.length > 128) {
    throw new InputError(
      "invalid_password",
      "Heslo musí mít 12 až 128 znaků.",
    );
  }

  return value;
}

export function validateEntityName(
  value: string,
  label: string,
  maximum = 160,
): string {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2 || name.length > maximum) {
    throw new InputError(
      "invalid_name",
      `${label} musí mít 2 až ${maximum} znaků.`,
    );
  }

  return name;
}

export function validateIco(value: string): string {
  const ico = value.replace(/\s/g, "");

  if (!/^\d{8}$/.test(ico)) {
    throw new InputError("invalid_ico", "IČO musí obsahovat přesně 8 číslic.");
  }

  const weights = [8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce(
    (total, weight, index) => total + Number(ico[index]) * weight,
    0,
  );
  const expectedCheckDigit = (11 - (sum % 11)) % 10;

  if (expectedCheckDigit !== Number(ico[7])) {
    throw new InputError("invalid_ico", "Kontrolní číslice IČO není platná.");
  }

  return ico;
}

export function normalizeBankAccount(value: string): string {
  return value.replace(/\s/g, "");
}

export function parseCzkAmount(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new InputError(
      "invalid_amount",
      "Částku zadejte v Kč, nejvýše se dvěma desetinnými místy.",
    );
  }
  const [crowns, pennies = ""] = normalized.split(".");
  const amountHalere = Number(crowns) * 100 + Number(pennies.padEnd(2, "0"));
  if (amountHalere < 1 || amountHalere > 2_000_000_000) {
    throw new InputError("invalid_amount", "Částka musí být kladná a přiměřená.");
  }
  return amountHalere;
}

export function validateDueDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InputError("invalid_due_date", "Zadejte platné datum splatnosti.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InputError("invalid_due_date", "Zadejte platné datum splatnosti.");
  }
  return value;
}

export function validatePaymentMessage(value: string): string {
  const message = value.trim().replace(/\s+/g, " ");
  if (message.length < 2 || message.length > 60) {
    throw new InputError(
      "invalid_payment_message",
      "Zpráva pro příjemce musí mít 2 až 60 znaků.",
    );
  }
  return message;
}

export function validateReason(value: string, label = "Důvod"): string {
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length < 2 || reason.length > 300) {
    throw new InputError(
      "invalid_reason",
      `${label} musí mít 2 až 300 znaků.`,
    );
  }
  return reason;
}

export function validatePaymentDate(value: string, today: string): string {
  const date = validateDueDate(value);
  if (date > today) {
    throw new InputError(
      "future_payment_date",
      "Datum platby nesmí být v budoucnosti.",
    );
  }
  return date;
}

export function validateUuid(value: string, label = "Identifikátor"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InputError("invalid_id", `${label} není platný.`);
  }
  return value;
}

export function validatePersonName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2 || name.length > 80) {
    throw new InputError(
      "invalid_person_name",
      `${label} musí mít 2 až 80 znaků.`,
    );
  }

  return name;
}

export function validateBirthYear(value: string): number {
  const year = Number.parseInt(value, 10);
  const currentYear = new Date().getFullYear();

  if (!/^\d{4}$/.test(value) || year < currentYear - 100 || year > currentYear) {
    throw new InputError(
      "invalid_birth_year",
      `Rok narození musí být mezi ${currentYear - 100} a ${currentYear}.`,
    );
  }

  return year;
}

export function normalizeJoinCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(compact)) {
    throw new InputError("invalid_join_code", "Týmový kód není platný.");
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function safeInternalPath(value: string | null, fallback = "/prehled") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://internal.local");
    return parsed.origin === "http://internal.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
