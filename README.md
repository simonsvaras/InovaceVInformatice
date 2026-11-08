# Klubio — školní demo

Modulární aplikace v Next.js a PostgreSQL pro klubové předpisy a evidenci
úhrad. Peníze přes aplikaci neprocházejí. Příchozí pohyby lze načítat z Fio API;
historická demo evidence zůstává trvale označená jako `simulated`.

## Spuštění přes Docker Compose

Požadavky: Docker s Compose pluginem.

1. Zkopírujte `.env.example` jako `.env`.
2. V `.env` nahraďte všechny hodnoty `replace_...` vlastními lokálními
   tajemstvími.
   `PUBLIC_APP_URL` musí odpovídat adrese, ze které uživatelé otevírají
   pozvánky a reset hesla. Pro skutečné odeslání e-mailu doplňte
   `RESEND_API_KEY` a ověřenou adresu `EMAIL_FROM`.
   `FIO_TOKEN_ENCRYPTION_KEY` musí být náhodný 32bajtový klíč zakódovaný v
   Base64. Lze jej vytvořit například příkazem `openssl rand -base64 32`.
   Změna klíče bez řízené rotace znemožní načíst dříve uložené Fio tokeny.
3. Spusťte aplikaci a databázi jediným příkazem:

   ```sh
   docker compose up --build -d
   ```

Při startu aplikační kontejner automaticky provede čekající SQL migrace. Služba
`fio-worker` samostatně zpracovává plánované i ručně vyžádané synchronizace.
Web je
standardně na `http://localhost:3000` a kontrola databáze na
`http://localhost:3000/api/health`. PostgreSQL nemá publikovaný hostitelský port.

Stav kontejnerů a log migrace:

```sh
docker compose ps
docker compose logs app
docker compose logs fio-worker
```

Zastavení bez smazání databázového volume:

```sh
docker compose down
```

Příkaz `docker compose down -v` databázi nevratně smaže a při běžném restartu se
nesmí používat.

## Vývojové kontroly

Po instalaci závislostí lze spustit:

```sh
npm run lint
npm run build
npm run db:generate
```

Projekt záměrně neobsahuje automatizované testy ani testovací soubory. Ověření
milníků probíhá ručně podle `docs/development-plan.md`.

## QR Platba

Jediný QR kód na detailu dluhu i v e-mailu obsahuje standardní český řetězec
`SPD*1.0` s historicky přiřazeným účtem, aktuální zbývající částkou v CZK,
variabilním symbolem a zprávou. QR se potvrzuje v bankovní aplikaci a nevede na
simulátor. Aktivní odkazy dřívější veřejné simulace zneplatňuje dopředná
migrace; historické pohyby a audit nemaže ani nepřejmenovává.

## Fio synchronizace

- V internetbankingu Fio vytvořte token pro konkrétní účet s oprávněním
  „Sledování účtu“. Aplikace ověří čtení, banku 2010, CZK, číslo účtu a IBAN;
  Fio ve výpisové odpovědi nepotvrzuje rozsah práv tokenu. Nový token může začít
  fungovat až přibližně za pět minut.
- Token se ukládá pomocí AES-256-GCM a po uložení se nevrací do prohlížeče ani
  se nezapisuje do logu. URL volání Fio, která obsahuje token v cestě, se
  neloguje.
- Worker používá periodický endpoint s překryvem, databázový lease a minimálně
  30sekundový odstup pro stejný token. Prvních sedm dní se importuje pouze do
  fronty k posouzení; další jednoznačné kladné CZK příjmy lze automaticky
  spárovat.
- Vypnutí nebo výpadek synchronizace nevypíná ruční evidenci ani rodičovské
  hlášení „Zaplatil jsem“.

## Účty, pozvánky a e-mail

- Session je neprůhledný náhodný token v `HttpOnly`, `SameSite=Lax` cookie;
  server v databázi drží pouze HMAC hash. Platnost session je 30 dní.
- Reset hesla je jednorázový a platí 30 minut. Úspěšná změna zneplatní všechny
  stávající session účtu.
- E-mailové pozvánky trenéra i člena jsou jednorázové, vázané na normalizovaný
  e-mail a platí 48 hodin. Aktivní pozvánku lze zrušit.
- Týmový kód platí 30 dní a pouze vytvoří žádost ke schválení. Vygenerování
  nového kódu zruší předchozí kód.
- Bez `RESEND_API_KEY` se stav nedoručení bezpečně uloží. Oprávněný správce či
  trenér stále uvidí právě vytvořené členské odkazy pro demo sdílení; reset
  hesla vyžaduje funkční e-mailovou konfiguraci.
