import Link from "next/link";

import { registerAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Message } from "@/components/message";
import { getCurrentUser } from "@/modules/auth/service";
import { safeInternalPath } from "@/lib/validation";
import { redirect } from "next/navigation";

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next ?? null);

  if (await getCurrentUser()) {
    redirect(next);
  }

  return (
    <AuthCard
      title="Vytvořit účet"
      intro="Účet patří rodiči, dospělému sportovci, trenérovi nebo správci klubu. Sportovce přidáte až po přihlášení."
    >
      <Message error={params.error} />
      <form action={registerAction} className="form-stack">
        <input name="next" type="hidden" value={next} />
        <label>
          Jméno a příjmení
          <input autoComplete="name" maxLength={120} name="displayName" required />
        </label>
        <label>
          E-mail
          <input autoComplete="email" maxLength={320} name="email" required type="email" />
        </label>
        <label>
          Heslo
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <small>Nejméně 12 znaků.</small>
        </label>
        <button type="submit">Vytvořit účet</button>
      </form>
      <p className="secondary-link">
        Už máte účet? <Link href={`/prihlaseni?next=${encodeURIComponent(next)}`}>Přihlaste se</Link>.
      </p>
    </AuthCard>
  );
}
