import Link from "next/link";

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <Link className="brand-link" href="/">
          Klubové platby
        </Link>
        <p className="eyebrow">Školní demo</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        {children}
      </section>
    </main>
  );
}
