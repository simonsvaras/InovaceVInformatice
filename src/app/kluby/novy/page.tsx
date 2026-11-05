import Link from "next/link";

import { CreateClubForm } from "@/components/create-club-form";
import { requireUser } from "@/modules/auth/service";

export default async function NewClubPage() {
  await requireUser();

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <Link className="brand-link" href="/prehled">
          ← Zpět na přehled
        </Link>
        <p className="eyebrow">Správce klubu</p>
        <h1>Založit klub</h1>
        <p>Jedním krokem vytvoříte klub, výchozí bankovní účet a první tým.</p>
        <CreateClubForm />
      </section>
    </main>
  );
}
