import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/modules/auth/service";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="home-shell">
      <AppHeader user={user} />

      <section className="home-hero" aria-labelledby="page-title">
        <div className="home-copy">
          <h1 id="page-title">
            Klubové příspěvky a platby přehledně na jednom místě.
          </h1>
          <p className="home-lead">
            Klubio dává správcům, trenérům a rodičům jeden přehled klubových
            příspěvků a úhrad. Bez dohledávání v tabulkách a zprávách.
          </p>

          {user ? (
            <div className="home-actions">
              <Link className="home-action home-action-primary" href="/prehled">
                Otevřít přehled
              </Link>
            </div>
          ) : (
            <div className="home-actions">
              <Link className="home-action home-action-primary" href="/registrace">
                Vytvořit účet
              </Link>
              <Link className="home-action home-action-secondary" href="/prihlaseni">
                Přihlásit se
              </Link>
            </div>
          )}

          <p className="home-disclaimer">
            Klubio peníze neposílá ani nepřijímá. Pouze eviduje jejich stav.
          </p>
        </div>

        <div className="home-ledger" aria-hidden="true">
          <div className="home-ledger-heading">
            <div>
              <span>Přehled klubu</span>
              <strong>Listopad</strong>
            </div>
            <span className="home-ledger-badge">Aktuální</span>
          </div>

          <div className="home-ledger-paper">
            <div className="home-ledger-summary">
              <span>Evidováno tento měsíc</span>
              <strong>27 350 Kč</strong>
            </div>

            <div className="home-ledger-row">
              <div>
                <strong>Členské příspěvky</strong>
                <span>Mladší žáci</span>
              </div>
              <div className="home-ledger-value">
                <strong>12 400 Kč</strong>
                <span className="home-ledger-done">Evidováno</span>
              </div>
            </div>

            <div className="home-ledger-row">
              <div>
                <strong>Soustředění</strong>
                <span>Starší žáci</span>
              </div>
              <div className="home-ledger-value">
                <strong>8 750 Kč</strong>
                <span>Čeká na 3</span>
              </div>
            </div>

            <div className="home-ledger-row">
              <div>
                <strong>Klubové dresy</strong>
                <span>Celý klub</span>
              </div>
              <div className="home-ledger-value">
                <strong>6 200 Kč</strong>
                <span className="home-ledger-done">Evidováno</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
