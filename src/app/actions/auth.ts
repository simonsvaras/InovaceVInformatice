"use server";

import { redirect } from "next/navigation";

import {
  authenticateUser,
  createUserSession,
  destroyCurrentSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "@/modules/auth/service";
import {
  formText,
  InputError,
  normalizeEmail,
  safeInternalPath,
  validateDisplayName,
} from "@/lib/validation";

function passwordValue(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || value.length === 0) {
    throw new InputError("invalid_password", "Heslo musí být vyplněné.");
  }

  return value;
}

function errorPath(path: string, error: unknown, next?: string) {
  const message =
    error instanceof InputError
      ? error.message
      : "Akci se nepodařilo dokončit. Zkuste to znovu.";
  const params = new URLSearchParams({ error: message });
  if (next) {
    params.set("next", next);
  }
  return `${path}?${params.toString()}`;
}

export async function registerAction(formData: FormData) {
  const next = safeInternalPath(formData.get("next")?.toString() ?? null);

  try {
    const user = await registerUser({
      email: normalizeEmail(formText(formData, "email")),
      displayName: validateDisplayName(formText(formData, "displayName")),
      password: passwordValue(formData, "password"),
    });
    await createUserSession(user.id);
  } catch (error) {
    redirect(errorPath("/registrace", error, next));
  }

  redirect(next);
}

export async function loginAction(formData: FormData) {
  const next = safeInternalPath(formData.get("next")?.toString() ?? null);

  try {
    const user = await authenticateUser(
      formText(formData, "email"),
      passwordValue(formData, "password"),
    );
    await createUserSession(user.id);
  } catch (error) {
    redirect(errorPath("/prihlaseni", error, next));
  }

  redirect(next);
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect(`/prihlaseni?success=${encodeURIComponent("Byli jste odhlášeni.")}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  try {
    await requestPasswordReset(formText(formData, "email"));
  } catch (error) {
    if (error instanceof InputError && error.code === "rate_limited") {
      redirect(errorPath("/zapomenute-heslo", error));
    }
  }

  redirect(`/zapomenute-heslo?success=${encodeURIComponent("Pokud účet existuje, odeslali jsme odkaz pro změnu hesla.")}`);
}

export async function resetPasswordAction(formData: FormData) {
  const token = formText(formData, "token");

  try {
    const password = passwordValue(formData, "password");
    const confirmation = passwordValue(formData, "passwordConfirmation");

    if (password !== confirmation) {
      throw new InputError("password_mismatch", "Zadaná hesla se neshodují.");
    }

    await resetPassword(token, password);
  } catch (error) {
    redirect(
      `${errorPath("/reset-hesla", error)}&token=${encodeURIComponent(token)}`,
    );
  }

  redirect(`/prihlaseni?success=${encodeURIComponent("Heslo bylo změněno. Přihlaste se znovu.")}`);
}
