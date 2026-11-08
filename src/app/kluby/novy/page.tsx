import { AppHeader } from "@/components/app-header";
import { CreateClubForm } from "@/components/create-club-form";
import { requireUser } from "@/modules/auth/service";

export default async function NewClubPage() {
  const user = await requireUser();

  return (
    <div className="auth-page">
      <AppHeader
        backLink={{ href: "/prehled", label: "Přehled" }}
        context={{ kind: "Nastavení", name: "Nový klub", role: "Správce klubu" }}
        user={user}
      />
      <main className="auth-shell">
        <section className="panel auth-card">
          <p className="eyebrow">Správce klubu</p>
          <h1>Založit klub</h1>
          <p>Jedním krokem vytvoříte klub, výchozí bankovní účet a první tým.</p>
          <CreateClubForm />
        </section>
      </main>
    </div>
  );
}
