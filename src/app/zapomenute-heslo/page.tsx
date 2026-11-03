import Link from "next/link";

import { requestPasswordResetAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Message } from "@/components/message";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Obnovení hesla"
      intro="Pokud účet existuje, pošleme na jeho adresu jednorázový odkaz platný 30 minut."
    >
      <Message error={params.error} success={params.success} />
      <form action={requestPasswordResetAction} className="form-stack">
        <label>
          E-mail účtu
          <input autoComplete="email" maxLength={320} name="email" required type="email" />
        </label>
        <button type="submit">Poslat odkaz</button>
      </form>
      <p className="secondary-link">
        <Link href="/prihlaseni">Zpět na přihlášení</Link>
      </p>
    </AuthCard>
  );
}
