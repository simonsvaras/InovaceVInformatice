# Návrh technické architektury

Stav: aktualizováno podle rozhodnutí zadavatele 2026-11-04. Business hranice a pracovní zjednodušení: `docs/requirements.md`, `docs/decisions.md`. Jde o modulární monolit pro školní demo.

## Stack a nasazení

| Vrstva | Návrh | Důvod / omezení |
| --- | --- | --- |
| Web a server | TypeScript, Next.js App Router na Node.js | Jeden repozitář a kontejner pro mobilní UI, serverové renderování a HTTP endpointy; obchodní logika zůstane mimo komponenty a handlery. |
| UI | React, responzivní komponenty, přístupné formuláře; orientační vizuální styl z Lovable | Mobilní použití; mapa a opravy prototypu jsou v `docs/design.md`. |
| Databáze | PostgreSQL, Drizzle ORM nad `postgres.js` a verzované SQL migrace | Transakce a unikátní omezení pro finanční konzistenci. Migrace se spustí před startem aplikace; doménové schéma se rozvíjí po malých verzovaných změnách. |
| Přihlášení | Vlastní neprůhledné serverové session v bezpečném cookie; hesla přes `bcryptjs` | V DB je pouze HMAC hash náhodného session tokenu. Pozvánky a role patří do vlastní domény; žádné klientské rozhodování o oprávnění. |
| E-mail | Resend přes izolovaný adaptér; stav doručení v DB | Požadovaná integrace. Odeslání po potvrzení DB změny; selhání nesmí vrátit ani zdvojit předpis a lze je ručně opakovat. |
| Banka | Fio adaptér, synchronizační worker a historický demo simulátor | Fio adaptér vrací normalizované pohyby se zdrojem `fio`; dřívější simulace zůstávají neměnně `simulated`. |
| Provoz | Jeden Docker image aplikace a PostgreSQL v Docker Compose; perzistentní DB volume | Zadavatel stáhne repozitář na vlastní server a spustí Compose. ECS, RDS, další cloudové služby ani další aplikační proces nejsou potřeba. |

Next.js oficiálně podporuje běh v Dockeru jako Node.js server a doporučuje předřadit reverzní proxy. Demo poběží v jedné aplikační instanci; stránky s finančními údaji nejsou veřejně cachované. Na serveru se musí vyřešit HTTPS, perzistentní volume a zálohy DB. Zdroje: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).

Technický základ M1 používá jediný migrační proces při startu aplikačního kontejneru. Compose čeká na zdravou databázi, migrace jsou idempotentně evidované v PostgreSQL a teprve po jejich dokončení se spustí Next.js. Health endpoint kontroluje spojení i přítomnost markeru verze schématu; databázový port není publikovaný na hostitele.

## Moduly a hranice

```text
Mobilní prohlížeč
  └─ Next.js UI → serverové handlery → aplikační služby
                                  ├─ Identity & invitations
                                  ├─ Clubs, teams & memberships
                                  ├─ Assessments & receivables
                                  ├─ Payments & reconciliation
                                  ├─ Notifications & exports
                                  └─ Bank feed port
                                        ├─ Fio adapter + sync worker
                                        └─ historical simulator adapter
                         ↓               ↓
                    PostgreSQL       Resend API
```

UI volá serverové aplikační služby; HTTP proces obsluhuje formuláře, ale Fio nikdy nevolá přímo v ruční akci. Akce pouze vloží synchronizační požadavek. Samostatný Compose worker získá krátký databázový lease integrace, respektuje globální limit tokenu a zpracuje plánované i ruční požadavky. Po úspěšném DB zápisu se odešle e-mail; stav doručení se uloží a případné selhání se nabídne k bezpečnému opakování.

Fio a historický simulátor jsou oddělené zdroje nad společnou frontou smíření. Zdroj a důvěryhodnost jsou neměnné atributy pohybu, události a odvozeného stavu; UI, e-mail, potvrzení i export musí historickou simulaci viditelně označit a Fio událost popsat samostatně. Jediný QR obsahuje standardní SPD podle D-19.

## Doménový a datový model (koncept)

- `users`, `sessions`, `clubs`, `club_admins`, `teams`, `team_coaches`, `athletes`, `guardians`, `memberships`, `invitations`, `join_requests`.
- `bank_accounts` patří klubu; jeden je výchozí, tým může mít vlastní. Normalizované číslo účtu je jedinečné napříč kluby a může sloužit více týmům jednoho klubu. Účet nemá režim ověřování. Změna výchozího či týmového účtu platí jen pro nové dluhy; starý účet zůstává v historii podle D-13. `bank_integrations` zachovává historickou demo konfiguraci, zatímco `fio_integrations` nese samostatný šifrovaný token, stav, kurzor, lease a časové údaje. `feed_exclusive_team_id` je trvalý vlastník výhradního týmového feedu; výchozí účet a účet s více současnými či historickými týmovými vazbami je sdílený. U sdíleného účtu vidí syrové pohyby pouze správce klubu (D-03).
- `assessments` jsou hromadné definice předpisu; `receivables` jsou individuální, neměnně identifikované dluhy. Dluh ukládá částku v haléřích, splatnost, účet, unikátní VS, příjemce a případný týmový původ. Celoklubový předpis vytvoří nejvýše jeden dluh pro každého unikátního sportovce, i když je ve více týmech; týmový původ je v tomto případě prázdný a export označí tým „Celý klub“. Spravuje jej klubový správce a používá výchozí klubový účet podle D-03.
- `variable_symbol_sequences` atomicky přiděluje další VS zvlášť pro každý cílový účet. DB zároveň vynucuje unikátní dvojici účet + VS a právě jeden dluh sportovce v jednom předpisu. `assessments.idempotency_key` s otiskem vstupu chrání celý formulář před dvojklikem a opakováním požadavku.
- `bank_transactions` ukládá normalizované pohyby s unikátní trojicí účet + zdroj + zdrojové ID. `source` je `fio` nebo historické `simulated`; trigger zakazuje změnu účtu, zdroje, ID, částky, měny, VS, času a původu po přijetí. Fio metadata obsahují protistranu, zprávu, typ a příznak počátečního importu. `payment_events.kind=fio` či `simulated` nese vazbu na pohyb. Jedno jednotlivé přiřazení dluhu je jedna událost a jedna alokace; korekční událost dědí vazbu na pohyb. Append-only součet je jediným zdrojem stavu dluhu.
- M4 používá pro potvrzení hlášení, hotovost a korekční protizápis společný serializační bod: cesta nejprve zamkne příslušný řádek `receivables`, potom samostatným dotazem znovu načte aktuální součet alokací a až následně zapíše událost, alokaci a audit. Součet před operací je součástí auditu. Nejde o limit zbývající částkou — D-05 povoluje částečné úhrady i přeplatek. Proti opakování stejné operace chrání unikátní zdroj hlášení, idempotency klíč hotovosti nebo jediný protizápis k původní události.
- `bank_transaction_evidence_links` eviduje rozhodnutí „stejná úhrada“ bez nové alokace. Aktivní vazba smí mířit jen na kladnou, neopravovanou `manual_claim` stejného účtu a částky; pohyb s aktivní vazbou nelze alokovat a pohyb s finanční historií nelze spojit. Oprava cílové ruční události vazbu nezničí, ale označí ji jako zneplatněnou a pohyb vrátí do fronty. Při ingestu se zamkne dluh a znovu načtou jeho alokace; při smíření se v pořadí rozsah → pohyb → dotčená událost/dluh zamknou řádky a teprve potom se načte čistá alokace pohybu i dluhu. Unikátní source ID, idempotency klíč formuláře, aktivní vazby a kontrola volné částky brání dvojímu započtení.
- Při ručním přiřazení se pod zámkem kontroluje i čekající hlášení a neopravovaná ruční úhrada vybraného dluhu. Pokud existují, oprávněný uživatel musí výslovně potvrdit, že přiřazovaný demo pohyb představuje jinou platbu; volba a důvod se zapíší do auditu bez ohledu na původní VS pohybu.
- `payment_claims` drží ruční hlášení a jeho odvolání/zamítnutí/potvrzení. `reminder_batches` a `reminder_recipients` evidují neutrální hromadnou upomínku odděleně od stavu dluhu a chrání její opakované odeslání idempotency klíčem. `audit_events` zachycují aktéra, čas, tým/klub, operaci a bezpečně vybrané změny. `notification_deliveries` ukládají stav odeslání e-mailu; reference na individuální dluh či adresáta upomínky je pro daný typ zprávy jedinečná, takže selhání ani opakovaný požadavek nevytvoří druhé doručení. Pokus o doručení má čas a unikátní lease token, kterým jsou podmíněny i konečné zápisy `sent`/`failed`, aby opožděný proces nepřepsal novější výsledek.
- Peněžní částky jsou integer v haléřích, čas UTC; uživatelské datumy a splatnost se zobrazují podle Europe/Prague. VS je text s kontrolou platného formátu a DB unikátností v rámci bankovního účtu, včetně historických dluhů. Již vystavený dluh si trvale ponechá původní účet, VS a QR údaje; účet se neodstraňuje, dokud je potřebný pro historii (D-13).

Stav „po splatnosti“ se odvodí z data a neuhrazené částky, nikoli ze samostatného účetního zápisu. Stav „nahlášeno“ vzniká jen z aktivního ručního hlášení. Částečná úhrada, zaplacení a přeplatek se odvozují z plateb a alokací. Přeplatek v MVP nezakládá kredit; zbytek čeká na ruční řešení dle D-05.

## Klíčové toky

1. **Pozvání a členství:** správce/trenér vytvoří časově omezenou jednorázovou e-mailovou pozvánku nebo týmový kód. Platný odkaz po registraci či přihlášení rovnou aktivuje členství jen u účtu se shodnou e-mailovou adresou; samotný odkaz je důkaz držení pozvánky a další ověřovací krok není. Kód vytvoří žádost čekající na trenéra. Pozvánka/kód dovoluje vytvořit sportovce pod daným účtem, nepřebírá existujícího sportovce podle jména. Rodič nevidí týmová data před aktivací členství. Přesun člena ukončí původní a založí nové členství bez přenosu starých dluhů.
2. **Vystavení předpisu:** autorizovaná služba pod zámkem ověří klub/tým, účet a adresáty, ukáže počet unikátních sportovců a v jedné DB transakci založí předpis, dluhy, VS a audit. Náhodný idempotency klíč je svázán s otiskem všech významných vstupů. Teprve po potvrzení transakce se z historického účtu, aktuálního zůstatku, VS a zprávy vytvoří SPD QR, odešle e-mail přes Resend a zaznamená výsledek doručení. Opakovaný požadavek vrátí původní předpis bez nových dluhů či e-mailu.
3. **Ruční platba:** rodič může u každého nezaplaceného dluhu vytvořit hlášení a vzít je zpět před vyřízením; technická konfigurace účtu se nekontroluje. Hlášení není finanční událost ani potvrzení přijetí peněz. Trenér spravuje hlášení svého týmu, správce klubu i celoklubové dluhy podle D-12. Oprávněný aktér může více hlášení potvrdit nebo zamítnout s důvodem. Potvrzení, zápis hotovosti i oprava protizápisem zamknou dluh, znovu načtou aktuální alokace a teprve potom vytvoří událost, alokaci a audit se součtem před operací. Kladná částka není omezena zbývající částkou, protože D-05 dovoluje přeplatek; opakovaný klik chrání unikátní zdroj, idempotency klíč nebo vazba protizápisu. Hotovost má oddělený typ, datum a původ.
4. **Fio synchronizace:** aktivace ověří oprávnění uživatele, čtení Fio, banku 2010, účet/IBAN a CZK bez držení DB zámku během sítě; před uložením tokenu znovu zamkne a ověří účet. Worker čte zadané období s překryvem, drží krátký lease a respektuje 30sekundový per-token limit. Příjem pohybů, audit a posun kurzoru commitují atomicky. Prvních sedm dní a všechny záporné či nejasné pohyby jdou do fronty. Nový kladný CZK příjem se automaticky přiřadí jen při jedinečném účtu/VS, přesné zbývající částce a bez čekajícího hlášení nebo možné ruční duplicity. Každá alokace zamkne pohyb, dluh a znovu načte alokace. Delivery vzniká v transakci, Resend se volá až po commitu.
5. **Informování:** e-mail s QR a potvrzení po párování se odešlou po DB zápisu; stav doručení se uloží. Neutrální upomínka se odešle jen oprávněně vybraným neuhrazeným příjemcům. CSV a potvrzení vznikají ze serverově autorizovaných dat a nesou označení simulace tam, kde je zdrojem demo pohyb.

## Bezpečnost, soukromí a provoz

- Autorizace je v každé aplikační službě i dotazu: klubový správce pro svůj klub, trenér pro své týmy, rodič pro vlastní sportovce. Při ruční kontrole projít i přímé URL s cizím ID, nejen skryté ovládací prvky.
- Hesla se ukládají moderním adaptivním hashem; session cookie `HttpOnly`, `Secure`, `SameSite`; ochrana CSRF u mutací, limitování pokusů o přihlášení a pozvánek. Veřejné kódy nesmí samy vystavit osobní nebo finanční data.
- V M2 používá bcrypt cost 12, 30denní neprůhlednou session a HMAC hash tokenů se serverovým tajemstvím. Next.js Server Actions ověřují původ mutací; všechny akce navíc znovu načítají uživatele ze serverové session a aplikují klubový/týmový filtr. Reset platí 30 minut, e-mailová pozvánka 48 hodin a týmový kód 30 dní. Kód pouze zakládá čekající žádost.
- DB heslo, Resend klíč, session secret a `FIO_TOKEN_ENCRYPTION_KEY` jsou mimo git. Fio token se ukládá pouze autentizovaně šifrovaný, po uložení se nevrací do UI a token ani URL s tokenem se nelogují. Přístup a změny integrace se auditují bez tajemství.
- PostgreSQL má perzistentní volume a není vystavený do internetu; veřejná aplikace běží přes HTTPS, s pravidelnou zálohou a ověřenou obnovou. Konfigurace a migrace jsou součástí návodu pro `docker compose up`. Demo pracuje se syntetickými daty.
- Neznámý stav banky se nikdy nevydává za skutečně ověřenou platbu. Před případným ostrým provozem je nutné doplnit skutečný zdroj bankovních pohybů a znovu posoudit ochranu dat.
- Ručně se kontrolují přímé přístupy na cizí klub/tým, soukromí dítěte, souběžné vystavení VS, opakované potvrzení demo pohybu, částečné a duplicitní platby, shoda pozdějšího pohybu s ručně evidovanou úhradou a opravy finančních záznamů. Automatizované testy se podle rozhodnutí A-04 nepíší.

## Náklady a škálování

Největší vývojová složitost je správnost plateb a oprávnění, nikoli počet služeb. Jedna aplikace a jedna PostgreSQL databáze snižují režii. Oddělený bankovní adaptér umožní později skutečné Fio bez přepisu UI. Demo nepotřebuje horizontální škálování ani další infrastrukturu; při budoucím ostrém provozu se musí znovu posoudit synchronizace, zálohy a ochrana dat.
# Oprava modelu identity sportovce při vstupu

`users` reprezentují přihlášení a komunikační adresu, `athletes` člena a `memberships` účast sportovce v týmu. `athletes.full_name` je kanonické zobrazované jméno, `birth_year` je nullable a historické sloupce jména se po nedestruktivním převodu již nepoužívají pro nové zápisy. `athlete_guardians.relationship` rozlišuje `self` a `child`; `NULL` je pouze přechodný stav historických vazeb čekajících na výslovné přiřazení.

Obě vstupní cesty volají společný resolver profilu uvnitř stejné databázové transakce jako členství nebo žádost. Resolver zamkne účet, znovu načte jeho osobní profil a serverově ověří vlastnictví zvoleného dítěte. Unikátní částečný index `(user_id) WHERE relationship = 'self'` brání dvěma osobním profilům. `athletes.creation_key` je unikátní pouze pro nově vytvářený profil dítěte a bezpečně opakuje dvojklik stejného formuláře. Aktivní členství a čekající žádosti nadále chrání existující částečné unikátní indexy.

Pozvánka se zamyká a spotřebuje až po úspěšném vložení členství. U kódu vzniká jen čekající žádost. Přístup k soupisce s kontaktem zůstává omezen na trenéra či správce; případný členský výpis nesmí připojit `users` ani zveřejnit kontakt. Finanční tabulky dál odkazují na stabilní `athlete_id` a e-mail se získává ze spravujícího účtu, proto migrace jména nemění dluhy ani jejich adresáta.

# Nahrazená architektura veřejné QR platby

Dřívější modul `public-payments` a jeho veřejný tok byly odstraněny podle D-19. Dopředná migrace revokuje aktivní odkazy; tabulky, již vzniklé `public_qr`/`simulated` pohyby, alokace a auditní vazby zůstávají pouze kvůli nedestruktivní historii. Konfigurace `PUBLIC_QR_*` již není runtime požadavek.

