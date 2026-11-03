import Link from "next/link";

import { resetPasswordAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Message } from "@/components/message";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard title="Nastavit nové heslo" intro="Použitím odkazu se odhlásí všechny dosavadní relace účtu.">
      <Message error={params.error} />
      {params.token ? (
        <form action={resetPasswordAction} className="form-stack">
          <input name="token" type="hidden" value={params.token} />
          <label>
            Nové heslo
            <input autoComplete="new-password" minLength={12} name="password" required type="password" />
          </label>
          <label>
            Nové heslo znovu
            <input autoComplete="new-password" minLength={12} name="passwordConfirmation" required type="password" />
          </label>
          <button type="submit">Změnit heslo</button>
        </form>
      ) : (
        <p className="message message-error">V odkazu chybí resetovací token.</p>
      )}
      <p className="secondary-link">
        <Link href="/prihlaseni">Zpět na přihlášení</Link>
      </p>
    </AuthCard>
  );
}
