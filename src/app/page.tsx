import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/modules/auth/service";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main>
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">Školní demo</p>
        <h1 id="page-title">Klubové platby</h1>
        <p>
          Technický základ aplikace je spuštěný. Aplikace pouze eviduje předpisy
          a platby; peníze přes ni nikdy neprocházejí.
        </p>
        {user ? (
          <div className="button-row">
            <Link className="button-link" href="/prehled">
              Přejít na přehled
            </Link>
            <form action={logoutAction}>
              <button className="button-secondary" type="submit">
                Odhlásit {user.displayName}
              </button>
            </form>
          </div>
        ) : (
          <div className="button-row">
            <Link className="button-link" href="/registrace">
              Vytvořit účet
            </Link>
            <Link className="button-link button-secondary" href="/prihlaseni">
              Přihlásit se
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
