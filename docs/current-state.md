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
- M3 dodal týmové i celoklubové předpisy, samostatný neměnný dluh pro každého unikátního sportovce, transakční VS jedinečný na cílovém účtu a ochranu formuláře proti dvojkliku náhodným idempotency klíčem a otiskem vstupu.
- Rodičovský přehled řadí otevřené dluhy podle splatnosti v `Europe/Prague`. Detail ukazuje Kč, splatnost, domácí účet, odvozený český IBAN, VS a zprávu, umožňuje kopírování a generuje standardní SPD 1.0 QR Platbu pro skutečný převod přímo na klubový či týmový účet.
- E-mail s platebními údaji a vloženým QR připravuje stávající Resend adaptér. `pending` doručení vzniká ve stejné transakci jako dluh, fyzické odeslání proběhne až po commitu a stav `failed`/zastaralý `sending` lze autorizovaně zopakovat se stejným Resend idempotency klíčem bez nového předpisu.

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
- Doručení M3 lze po doplnění konfigurace Resendu zopakovat z detailu předpisu; lokální ověření bez klíče úmyslně končilo `email_not_configured`. Skutečné odeslání přes veřejný Resend účet nebylo v tomto prostředí provedeno a vlastní SMTP server ani Mailpit nebyl přidán.
- Stabilní delivery ID chrání běžný i souběžný retry lokálně; u velmi pozdního opakování po nejednoznačné odpovědi poskytovatele zůstává zbytková závislost na době, po kterou Resend uchovává idempotency klíče. Před ostrým provozem je nutné tuto lhůtu ověřit a případně doplnit provider reconciliation.

## Stav implementace a ověření M2

- `npm run lint` a `npx tsc --noEmit` prošly. Produkční Linux image se sestavil přes `docker compose up --build -d`; obě služby jsou zdravé a `/api/health` vrací `schemaVersion: M2-0005`.
- PostgreSQL eviduje šest aplikovaných migrací. Databáze obsahuje částečné unikátní indexy pro jednoho aktivního trenéra týmu, jeden aktivní týmový kód, jedno aktivní členství sportovce v týmu a jednu čekající žádost sportovce do týmu.
- Podle výslovného pokynu zadavatele nebyl proveden ruční uživatelský průchod obrazovek ani souběžných scénářů. Nevznikly automatizované testy ani testovací soubory; ověření M2 je omezené na lint, typovou kontrolu, produkční build, migrace, health a nezávislou read-only revizi.
- `code-reviewer` našel pět nálezů: neatomickou trenérskou autorizaci, únik e-mailu kandidáta na náhradního trenéra, souběžnou rotaci kódu, zneplatnění starého resetu při nedoručení nového a chybějící audit resetu. Všech pět bylo přijato a opraveno. Týmové mutace nyní znovu ověřují roli pod zámkem týmu, trenér vidí jen členské pozvánky, aktivní kód chrání DB invariant, starší reset zůstává platný do úspěšné změny a reset zapisuje audit bez tajných údajů.

## Stav implementace a ověření M3

- `npm run lint`, `npx tsc --noEmit`, čistý `npm run build` a `npm run db:generate` prošly. Drizzle po migracích `0006` až `0010` nehlásí další změnu schématu a PostgreSQL eviduje 11 aplikovaných migrací. Produkční Docker image se sestavil, aplikace i PostgreSQL jsou zdravé a `/api/health` vrací `schemaVersion: M3-0010`.
- V syntetickém klubu byly ručně vystaveny týmový předpis pro dva členy na týmový účet `27/0100` a celoklubový předpis na výchozí účet `19/0100`. Sportovec s aktivním členstvím ve dvou týmech dostal v celoklubovém předpisu právě jeden dluh: oba předpisy mají po dvou dluzích a počty dluhů a unikátních sportovců se shodují.
- Dvojklik na celoklubový formulář vrátil původní předpis se zprávou, že další dluhy nevznikly. DB po dvojkliku obsahovala dva předpisy a čtyři dluhy; na každém cílovém účtu byly dva různé VS `1000000001` a `1000000002`.
- Rodičovský přehled zobrazil nejprve splatnost `2026-11-20`, potom `2026-12-01`, správné částky v Kč a oba sportovce. Detail dluhu zobrazil a zkopíroval účet a vykreslil QR s řetězcem `SPD*1.0*ACC:CZ7301000000000000000019*AM:800.00*CC:CZK*X-VS:1000000001*MSG:Prispevek M3 klub`; nejde o URL simulátoru.
- Ruční výpis připraveného e-mailu obsahoval sportovce, klub/rozsah, částku, splatnost, účet, VS, zprávu, odkaz na autorizovaný detail, stejný SPD řetězec a vloženou PNG přílohu s CID. Bez Resend klíče vznikly čtyři stavy `failed/email_not_configured`, vždy jeden na dluh a až po commitu finanční transakce.
- Autorizované opakování jednoho selhaného doručení ponechalo stav selhání kvůli chybějícímu klíči, ale počet zůstal dva předpisy, čtyři dluhy a čtyři delivery reference. Pokus měl neprázdný čas i unikátní token a zapsal audit retry. Zobrazení rodičovského i manažerského finančního detailu zapsalo audit s aktérem a cílem bez platebních údajů v detailech.
- Rodič otevřením manažerského URL a cizí účet otevřením rodičovského dluhu dostali 404. Správce ani cizí účet nezískali detail dluhu rodiče. Serverové dotazy nadále filtrují klub/tým/sportovce, nikoli jen viditelnost ovládacích prvků.
- Po `docker compose restart app` se migrace znovu dokončily idempotentně, health se obnovil a v pojmenovaném volume zůstaly dva předpisy, čtyři dluhy i marker `M3-0010`. Syntetická ověřovací data zůstávají pouze v lokálním Docker volume; nový deployment s čistým volume je neobsahuje.
- Při průchodu byla opravena starší chyba M2 v SQL parametru časového okna rate-limitu, která blokovala přihlášení, a české texty v Server Action redirect hlavičkách byly URL-enkódovány. Ručně prošlo přihlášení i korektní odhlášení.
- `code-reviewer` našel tři úvodní nálezy: chybějící bezpečný retry po přerušení mezi commitem a doručením, chybějící audit čtení bankovních údajů a UTC datum místo `Europe/Prague`. Všechny byly přijaty a opraveny transakčním delivery/outbox záznamem s autorizovaným retry, audity finančních detailů a jednotným českým kalendářním dnem. Druhá kontrola odhalila souběh u vypršelého delivery lease; i ten byl přijat a opraven časem a unikátním tokenem každého pokusu, jímž jsou podmíněny konečné aktualizace stavu. Závěrečná read-only kontrola potvrdila odstranění nálezu a nenašla konkrétní blokující problém. Automatizované testy ani testovací soubory nevznikly.

## Nejbližší krok

1. V dalším samostatném úkolu zahájit M4: ruční hlášení převodu, hotovost, potvrzení či zamítnutí a přehled člen × předpis.
