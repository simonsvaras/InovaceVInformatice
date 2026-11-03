import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/modules/auth/service";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-link" href="/prehled">
          Klubové platby
        </Link>
        <form action={logoutAction}>
          <button className="button-secondary" type="submit">
            Odhlásit
          </button>
        </form>
      </header>
      <section className="content-stack">
        <div>
          <p className="eyebrow">Přihlášený účet</p>
          <h1>Vítejte, {user.displayName}</h1>
          <p>{user.email}</p>
        </div>
        <article className="panel">
          <h2>Začínáme</h2>
          <p>
            Založte klub jako správce, nebo použijte e-mailovou pozvánku či
            týmový kód. Účet a sportovec jsou oddělené záznamy.
          </p>
          <div className="button-row">
            <Link className="button-link" href="/kluby/novy">
              Založit klub
            </Link>
            <Link className="button-link button-secondary" href="/vstup">
              Vstoupit přes kód
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
