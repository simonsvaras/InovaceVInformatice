# Klubio — školní demo

Technický základ modulárního monolitu v Next.js a PostgreSQL. Aplikace pouze
eviduje předpisy a platby; peníze přes ni neprocházejí a bankovní pohyby v MVP
budou výhradně simulované.

## Spuštění přes Docker Compose

Požadavky: Docker s Compose pluginem.

1. Zkopírujte `.env.example` jako `.env`.
2. V `.env` nahraďte všechny hodnoty `replace_...` vlastními lokálními
   tajemstvími.
   `PUBLIC_APP_URL` musí odpovídat adrese, ze které uživatelé otevírají
   pozvánky a reset hesla. Pro skutečné odeslání e-mailu doplňte
   `RESEND_API_KEY` a ověřenou adresu `EMAIL_FROM`.
   `PUBLIC_QR_BASE_URL` musí být veřejná absolutní HTTPS adresa bez
   `localhost`; výchozí hodnota míří na školní ngrok adresu. Nastavte také
   samostatné náhodné `PUBLIC_QR_TOKEN_SECRET` o délce nejméně 32 znaků.
   Toto tajemství neměňte, dokud mají vydané platební odkazy zůstat platné.
3. Spusťte aplikaci a databázi jediným příkazem:

   ```sh
   docker compose up --build -d
   ```

Při startu aplikační kontejner automaticky provede čekající SQL migrace. Web je
standardně na `http://localhost:3000` a kontrola databáze na
`http://localhost:3000/api/health`. PostgreSQL nemá publikovaný hostitelský port.

Stav kontejnerů a log migrace:

```sh
docker compose ps
docker compose logs app
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

## Veřejná QR platba

Jediný QR kód na detailu dluhu a v e-mailu obsahuje veřejný HTTPS odkaz na
mobilní platební stránku. Návštěvník nepotřebuje účet ani session. Stránka
zobrazuje pouze účet, aktuální zbývající částku, variabilní symbol a zprávu;
potvrzení vytvoří simulovaný příchozí pohyb a nepředstavuje skutečný bankovní
převod. Odkazy jsou omezené na jeden dluh, lze je zrušit a znovu vydat a jejich
surové tokeny se v databázi neukládají.

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
