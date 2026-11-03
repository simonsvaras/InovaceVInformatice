import Link from "next/link";

import { createClubAction } from "@/app/actions/clubs";
import { Message } from "@/components/message";
import { requireUser } from "@/modules/auth/service";

export default async function NewClubPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <Link className="brand-link" href="/prehled">
          ← Zpět na přehled
        </Link>
        <p className="eyebrow">Správce klubu</p>
        <h1>Založit klub</h1>
        <p>Jedním krokem vytvoříte klub, výchozí bankovní účet a první tým.</p>
        <Message error={params.error} />
        <form action={createClubAction} className="form-stack">
          <label>
            Název klubu
            <input maxLength={160} name="clubName" required />
          </label>
          <label>
            IČO
            <input inputMode="numeric" maxLength={8} name="ico" required />
          </label>
          <label>
            Výchozí bankovní účet
            <input maxLength={32} name="accountNumber" placeholder="123456789/0100" required />
            <small>Peníze směřují přímo na tento účet; aplikace je nepřijímá.</small>
          </label>
          <label>
            Název prvního týmu
            <input maxLength={160} name="teamName" required />
          </label>
          <button type="submit">Založit klub a tým</button>
        </form>
      </section>
    </main>
  );
}
