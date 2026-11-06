import Link from "next/link";
import { redirect } from "next/navigation";

import { loginAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Message } from "@/components/message";
import { safeInternalPath } from "@/lib/validation";
import { getCurrentUser } from "@/modules/auth/service";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next ?? null);

  if (await getCurrentUser()) {
    redirect(next);
  }

  return (
    <AuthCard
      headerAction={{ href: `/registrace?next=${encodeURIComponent(next)}`, label: "Vytvořit účet" }}
      title="Přihlášení"
      intro="Pokračujte do svého klubu, týmů a sportovců."
    >
      <Message error={params.error} success={params.success} />
      <form action={loginAction} className="form-stack">
        <input name="next" type="hidden" value={next} />
        <label>
          E-mail
          <input autoComplete="email" maxLength={320} name="email" required type="email" />
        </label>
        <label>
          Heslo
          <input autoComplete="current-password" name="password" required type="password" />
        </label>
        <button type="submit">Přihlásit se</button>
      </form>
      <div className="secondary-link">
        <Link href="/zapomenute-heslo">Zapomenuté heslo</Link>
        <span> · </span>
        <Link href={`/registrace?next=${encodeURIComponent(next)}`}>Nový účet</Link>
      </div>
    </AuthCard>
  );
}
