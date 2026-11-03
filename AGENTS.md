# Pravidla vývoje s Codexem

## Zdroj pravdy a stav práce

- Business zadání je `zadani.md`. Jeho výklad a rozsah eviduje `docs/requirements.md`; návrh systému je v `docs/architecture.md`; obrazovky a opravy prototypu v `docs/design.md`; schválená a pracovní rozhodnutí v `docs/decisions.md`; pořadí práce v `docs/development-plan.md`; aktuální stav v `docs/current-state.md`.
- Před prací čti `docs/current-state.md`, příslušný milník v plánu a dotčené části požadavků a architektury. Neopakuj celou analýzu zadání, pokud se zadání nezměnilo nebo nebyl nalezen rozpor.
- U školního dema vol jednoduché rozumné pracovní pravidlo, zaznamenej je do `docs/decisions.md` a zkontroluj soulad se zadáním. Jen změnu výslovně schválených pravidel nebo přechod k ostrému provozu konzultuj se zadavatelem.
- Po dokončení milníku zapiš do `docs/current-state.md` výsledek, ověření, známé překážky a další krok. Při změně architektury aktualizuj `docs/decisions.md` a relevantní dokumenty v jednom úkolu.
- Aktuální fázi a nejbližší milník určuje `docs/current-state.md`. Přípravný milník M0 je pouze validace a dokumentace návrhu; implementaci aplikace začni až samostatným úkolem pro M1.

## Lead Agent

- Vždy vlastní návrh, plán, implementaci, integraci, ruční ověření, dokumentaci a výsledek. Rozdělí práci na malé milníky s jasnými akceptačními kritérii.
- Subagenty používá pouze pro nezávislé kontroly. Revizní agenti čtou a vracejí nálezy; nikdy neimplementují ani neupravují soubory. Tím nevznikají souběžné úpravy stejných souborů.
- Po významné změně architektury přizve `architecture-reviewer`; po změnách implementace s dopadem na peníze, oprávnění, osobní údaje nebo integrace přizve `code-reviewer`. Revizi provádí nad konkrétním návrhem nebo diffem, před uzavřením milníku.
- Výstupy agentů sjednotí, vyřeší rozpory, uvede přijaté a nepřijaté připomínky a sám ověří akceptační kritéria. Subagent nerozhoduje o business pravidlech.

## Hranice systému

- Peníze neprocházejí aplikací. Nikdy neoznačuj kliknutí v simulátoru ani tvrzení rodiče za bankovně ověřený převod.
- Server ověřuje oprávnění podle klubu a týmu u každého čtení i zápisu; UI není bezpečnostní hranice.
- Změny finančních záznamů, pozvánek, členství a oprávnění vyžadují kontrolu důsledků, auditní stopu a cílené ruční ověření. Neměň historii destruktivním mazáním.
- Prototyp v `prototype-design` je orientační vizuální podklad; při rozporu má zadání a `docs/decisions.md` přednost. Mapa obrazovek je v `docs/design.md`.
- Nikdy nepiš automatizované testy ani testovací soubory. Ověřuj scénáře ručně v aplikaci, kontrolou dat a výsledkem build/lint/migrace. Stejné pravidlo platí pro subagenty.

## Pracovní postup

1. Vyber jediný milník a ověř jeho vstupní rozhodnutí.
2. Sepiš konkrétní změny; subagentovi předej pouze read-only revizi jasně vymezeného návrhu nebo diffu.
3. Implementuj malou vertikální část; ručně ověř odpovídající scénáře včetně cizích oprávnění a opakovaných finančních operací.
4. Zapracuj revizi, aktualizuj stav a předej výsledek s omezeními.

Konfigurace rolí: `.codex/config.toml` a `.codex/agents/*.toml`. Výchozí model Lead Agenta je nastavení uživatele; projekt ho nepřepisuje.
