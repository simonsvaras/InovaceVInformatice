export default function Home() {
  return (
    <main>
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">Školní demo</p>
        <h1 id="page-title">Klubové platby</h1>
        <p>
          Technický základ aplikace je spuštěný. Aplikace pouze eviduje předpisy
          a platby; peníze přes ni nikdy neprocházejí.
        </p>
        <a href="/api/health">Zkontrolovat stav aplikace a databáze</a>
      </section>
    </main>
  );
}
