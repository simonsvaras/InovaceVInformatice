# Aktuální stav projektu

Aktualizováno: 2026-11-03.

## Hotovo

- Zanalyzováno `zadani.md`; rozsah školního demo MVP a pravidla jsou v `docs/requirements.md`.
- Zadavatel schválil TypeScript/Next.js/PostgreSQL/Docker, nasazení přes Docker Compose na vlastním serveru, demo bankovní simulátor a přímý vstup z e-mailové pozvánky po registraci nebo přihlášení.
- Dodané `prototype-design/Popis.md` a osm snímků byly prohlédnuty. `docs/design.md` mapuje existující stránky, navrhuje chybějící obrazovky a opravuje rozpory s business zadáním.
- `docs/architecture.md`, `docs/decisions.md` a `docs/development-plan.md` byly upraveny pro jednoduché demo bez ECS, skutečného Fio, workeru a automatizovaných testů.
- `AGENTS.md` stanoví, že Lead Agent vždy navrhuje a implementuje; subagenti jen nezávisle kontrolují bez úprav. Oba profily v `.codex/agents/` mají nakonfigurován `gpt-5.6-sol` a `medium`.
- Nezávislá revize aktualizovaných dokumentů našla bezpečnostní mezery v pozvánce a týmovém kódu a několik chybějících kritérií. Byly zapracovány do rozhodnutí, architektury, designu a plánu. Závěrečná read-only kontrola nenašla další zásadní rozpor; její poslední připomínka ke zbytečnému druhému ověření e-mailu byla také zapracována.
- Kontrola repozitáře a agentní konfigurace uzavřela M0: všechny tři TOML soubory se načítají, cesty k rolím a jejich pole odpovídají aktuální dokumentaci Codexu, osm snímků prototypu je přítomných. Doplněno IČO při registraci, oprávnění správce pro celoklubové ruční dluhy (D-12), neměnnost účtu vystaveného dluhu (D-13) a chybějící správní obrazovky.
- Následná nezávislá read-only architektonická revize našla čtyři konkrétní mezery: změnu účtu, obecné formulace o ručních platbách, scénář zrušení dluhu a mapu správních obrazovek. Všechny čtyři připomínky byly přijaty a zapracovány; žádná nebyla odmítnuta. Kontrola návazností po úpravě nenašla staré rozporné formulace.
- Schválený návrh M0, prototypové podklady, agentní konfigurace a bezpečný `.gitignore` byly uloženy v prvním commitu `8508dce` před zahájením aplikační implementace.
- M1 dodal Next.js App Router v TypeScriptu, typovaný PostgreSQL přístup přes Drizzle ORM/`postgres.js`, první verzovanou migraci, databázový health endpoint, produkční Dockerfile a Docker Compose s nepublikovanou DB a pojmenovaným volume.
- Lokální tajemství jsou v ignorovaném `.env`; repozitář obsahuje jen `.env.example` se zástupnými hodnotami. Start je popsán v `README.md` a aplikační kontejner před spuštěním Next.js automaticky provede čekající migrace.
- M2 dodal registraci a přihlášení, 30denní serverové session, rate-limit, jednorázový reset hesla, založení klubu s IČO/účtem/prvním týmem, správní a trenérské role a přepínání trenérových týmů.
- Trenérské i členské e-mailové pozvánky jsou jednorázové, zrušitelné, platí 48 hodin a vyžadují shodný normalizovaný e-mail. Týmový kód platí 30 dní, nový ruší starý a vždy vytváří pouze žádost ke schválení.
- Účet uživatele je oddělený od sportovce. Rodič může spravovat více sportovců, ale ve vstupu přes pozvánku či kód může vybrat pouze vlastní ID nebo založit nový záznam; aplikace nikdy nepřiřazuje sportovce podle shody jména.

## Kontrola konzistence

| Business oblast | Architektonické řešení | Milník a obrazovka |
| --- | --- | --- |
| Účet rodiče není sportovec; pozvání a kód mají jiné schválení | Oddělené `users`/`athletes`, jednorázová e-mailová pozvánka se shodou adresy, kód se žádostí, zákaz převzetí existujícího sportovce | M2; vstup člena, správa týmu |
| Individuální dluh, VS na účet, celoklubový předpis | `assessments` + `receivables`, unikátní VS, jeden dluh na sportovce i při více týmech | M3; vytvoření předpisu, rodičovský detail |
| Ruční hlášení, hotovost a přehled kdo zaplatil | Oddělené hlášení, platební událost a alokace; matice člen × předpis | M4; K potvrzení, Kdo zaplatil |
| Demo banka bez skutečného převodu | `BankFeedProvider` se simulátorem a trvalým označením původu; sdílený účet izoluje správce | M5; nastavení účtu, simulátor, Nespárované |
| Soukromí, historie, export a zachování dluhů po odchodu | Serverová oprávnění na klub/tým/sportovce, audit, archivace místo mazání | M6–M7; historie, příchozí platby, týmy |
| Nasazení školního dema | Aplikace a PostgreSQL v Docker Compose na vlastním serveru | M8; ruční průchod a dokumentované spuštění |

## Stav implementace a ověření M1

- `npm run lint` prošel bez nálezů a čistý `npm run build` vytvořil produkční build se statickou úvodní stránkou a dynamickým `/api/health`.
- `npm audit --omit=dev` hlásí 0 zranitelností produkčních závislostí. Úplný audit hlásí 20 středních nálezů pouze ve vývojovém toolingu Drizzle Kit/ESLint (`esbuild`, `minimatch`); dostupná automatická oprava by provedla nekompatibilní downgrade. Jde o známý dluh vývojových závislostí, který je nutné znovu zkontrolovat při jejich aktualizaci.
- `docker compose up --build -d` sestavil image a spustil zdravé kontejnery `app` a `db`; web byl dostupný na hostitelském portu 3000, PostgreSQL zůstal pouze na Compose síti.
- Startovací log potvrdil dokončení migrace. V `drizzle.__drizzle_migrations` zůstal právě jeden záznam a `/api/health` vrátil `200` s `database: connected` a `schemaVersion: M1-0000`.
- Před restartem byl do `app_metadata` vložen `manual_persistence_check=M1-before-restart`. Po `docker compose restart` se migrace bezpečně spustila znovu bez duplicity, health endpoint se obnovil a kontrolní záznam i počet jedné aplikované migrace zůstaly zachované.
- Automatizované testy ani testovací soubory nevznikly. Skutečné Fio a ostrý provoz s reálnými údaji zůstávají mimo schválené demo MVP.
- Nezávislá architektonická a kódová read-only revize nenašla blokující ani středně závažný problém. Jediný konkrétní nízký nález o ručním duplikování DB hesla v `DATABASE_URL` byl přijat: runtime nyní skládá připojení ze samostatných `PG*` proměnných předaných Compose. Zbytková rizika pohyblivých patch tagů image a migračního retry byla pro školní demo přijata; validace session tajemství patří do M2 a HTTPS, reverzní proxy a zálohy do M8.

## Známá omezení

- Compose konfigurace je připravená pro demo; před veřejným nasazením je stále nutné doplnit reverzní proxy, HTTPS a provozní zálohování podle M8.
- ESLint 9 je připnutý kvůli aktuálním peer požadavkům `eslint-config-next`; npm jej již označuje jako nepodporovanou hlavní verzi. Přechod na ESLint 10 je vhodný až po kompatibilní aktualizaci lintovacích pluginů.
- Reset hesla a automatické doručení pozvánek vyžadují nakonfigurovaný Resend. Bez klíče se selhání uloží a oprávněný uživatel může právě vytvořené pozvánkové odkazy zkopírovat; resetovací token se z bezpečnostních důvodů nezobrazuje ani neloguje.

## Stav implementace a ověření M2

- `npm run lint` a `npx tsc --noEmit` prošly. Produkční Linux image se sestavil přes `docker compose up --build -d`; obě služby jsou zdravé a `/api/health` vrací `schemaVersion: M2-0005`.
- PostgreSQL eviduje šest aplikovaných migrací. Databáze obsahuje částečné unikátní indexy pro jednoho aktivního trenéra týmu, jeden aktivní týmový kód, jedno aktivní členství sportovce v týmu a jednu čekající žádost sportovce do týmu.
- Podle výslovného pokynu zadavatele nebyl proveden ruční uživatelský průchod obrazovek ani souběžných scénářů. Nevznikly automatizované testy ani testovací soubory; ověření M2 je omezené na lint, typovou kontrolu, produkční build, migrace, health a nezávislou read-only revizi.
- `code-reviewer` našel pět nálezů: neatomickou trenérskou autorizaci, únik e-mailu kandidáta na náhradního trenéra, souběžnou rotaci kódu, zneplatnění starého resetu při nedoručení nového a chybějící audit resetu. Všech pět bylo přijato a opraveno. Týmové mutace nyní znovu ověřují roli pod zámkem týmu, trenér vidí jen členské pozvánky, aktivní kód chrání DB invariant, starší reset zůstává platný do úspěšné změny a reset zapisuje audit bez tajných údajů.

## Nejbližší krok

1. V dalším samostatném úkolu zahájit M3: předpisy, individuální dluhy, unikátní VS, QR platby a e-mail adresátům.
