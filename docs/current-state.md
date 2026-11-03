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

## Kontrola konzistence

| Business oblast | Architektonické řešení | Milník a obrazovka |
| --- | --- | --- |
| Účet rodiče není sportovec; pozvání a kód mají jiné schválení | Oddělené `users`/`athletes`, jednorázová e-mailová pozvánka se shodou adresy, kód se žádostí, zákaz převzetí existujícího sportovce | M2; vstup člena, správa týmu |
| Individuální dluh, VS na účet, celoklubový předpis | `assessments` + `receivables`, unikátní VS, jeden dluh na sportovce i při více týmech | M3; vytvoření předpisu, rodičovský detail |
| Ruční hlášení, hotovost a přehled kdo zaplatil | Oddělené hlášení, platební událost a alokace; matice člen × předpis | M4; K potvrzení, Kdo zaplatil |
| Demo banka bez skutečného převodu | `BankFeedProvider` se simulátorem a trvalým označením původu; sdílený účet izoluje správce | M5; nastavení účtu, simulátor, Nespárované |
| Soukromí, historie, export a zachování dluhů po odchodu | Serverová oprávnění na klub/tým/sportovce, audit, archivace místo mazání | M6–M7; historie, příchozí platby, týmy |
| Nasazení školního dema | Aplikace a PostgreSQL v Docker Compose na vlastním serveru | M8; ruční průchod a dokumentované spuštění |

## Stav implementace

- Aplikace, databázové migrace, Docker Compose ani nasazení ještě nevznikly. Tento úkol je pouze přípravou návrhu.
- Žádné automatizované testy se podle výslovné instrukce zadavatele nebudou psát. Milníky mají ruční ověřovací scénáře.
- Skutečné Fio a ostrý provoz s reálnými údaji nejsou součástí schváleného demo MVP.
- Lokální větev `main` zatím nemá žádný commit a všechny projektové soubory jsou nesledované. Vzdálený repozitář `origin` zatím nemá větev; dokumentace tedy dosud není uložená v historii Git/GitHub. To nebrání návrhu M0, ale před sdílením a implementací je vhodné vytvořit první commit a publikovat jej.

## Nejbližší krok

1. Předat zadavateli shrnutí M0 a upozornit na dosud neuložený první commit.
2. Na další implementační pokyn zahájit M1. Lead Agent bude implementaci řídit a subagenty použije jen k revizi.
