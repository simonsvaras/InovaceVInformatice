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
