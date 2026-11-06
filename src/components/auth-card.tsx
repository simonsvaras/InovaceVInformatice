import { AppHeader } from "@/components/app-header";

export function AuthCard({
  title,
  intro,
  children,
  headerAction,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
  headerAction?: { href: string; label: string };
}) {
  return (
    <div className="auth-page">
      <AppHeader guestAction={headerAction} />
      <main className="auth-shell">
        <section className="panel auth-card">
          <p className="eyebrow">Školní demo</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
