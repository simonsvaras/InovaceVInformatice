# Klubové platby — školní demo

Technický základ modulárního monolitu v Next.js a PostgreSQL. Aplikace pouze
eviduje předpisy a platby; peníze přes ni neprocházejí a bankovní pohyby v MVP
budou výhradně simulované.

## Spuštění přes Docker Compose

Požadavky: Docker s Compose pluginem.

1. Zkopírujte `.env.example` jako `.env`.
2. V `.env` nahraďte všechny hodnoty `replace_...` vlastními lokálními
   tajemstvími.
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
