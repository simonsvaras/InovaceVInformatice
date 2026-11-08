# Fix TODO – srozumitelný stav úhrady dluhu pro rodiče

Zapsáno 2026-11-08 po ručním testu. Nic z toho zatím není implementováno.

## Problém

Rodič nepozná, jestli je dluh zaplacený celý, částečně, nebo vůbec. Stav „Nahlášeno — čeká na potvrzení“ překrývá skutečný stav úhrady. Při testu měl dluh 1 500 Kč, v evidenci 0 Kč, k tomu hlášení „Zaplatil jsem“ na 1 000 Kč a demo pohyb 1 000 Kč ve frontě smíření. Obrazovka ukazovala jen „Nahlášeno“ a rodič nevěděl, jestli je zaplaceno.

## Proč se to tak chová

- `deriveDebtState` v `src/modules/payments/status.ts` dává stavu `reported` (čeká hlášení) přednost před `partial`, takže se skutečně započtená částka v názvu stavu ztratí.
- Částky „evidováno / zbývá“ jsou na některých obrazovkách jen jako drobný text, na jiných vůbec.
- Nespárovaný demo pohyb (`bank_transactions.status = unmatched`) rodič nevidí vůbec. Dozví se jen hlášku po odeslání simulátoru, která je hned pryč.
- Hlášení „Zaplatil jsem“ a demo pohyb u stejného dluhu rodiči nic neříkají o tom, že je musí rozhodnout správce a že se samy nesčítají.

## Návrh oprav (až se rozhodne)

1. **Oddělit „skutečně zaplaceno“ od „čeká na vyřízení“.** U každého dluhu vždy ukázat tři řádky: Předepsáno, Evidováno jako zaplacené, Zbývá. Hlášení zobrazit jako samostatný štítek vedle toho („Čeká potvrzení: 1 000 Kč“), ne místo stavu.
2. **Stav dluhu ukazovat podle evidovaných plateb** (Čeká na platbu / Částečně zaplaceno / Zaplaceno / Přeplaceno). `reported` nechat jen jako doplňkový štítek.
3. **Vysvětlující věta u čekajících věcí:** například „Vaše hlášení 1 000 Kč zatím nepotvrdil správce. Dluh se tím nezměnil.“ a „Demo platba 1 000 Kč čeká na rozhodnutí správce, nepočítá se jako zaplacená.“
4. **Rodiči zobrazit i nespárované demo pohyby** u jeho dluhu (jen jeho VS), s důvodem „částka neodpovídá zbývající částce“ a textem, že o nich rozhodne správce.
5. **Varovat při nesedící částce** přímo v simulátoru nebo v hlášení: „Zbývá 1 500 Kč, zadáváte 1 000 Kč. Platba se neprovede automaticky, rozhodne správce.“
6. **Upozornit na možnou dvojí evidenci:** když u dluhu existuje čekající hlášení i demo pohyb, ukázat správci i rodiči, že jde o dvě stejné platby, které se mají spojit, ne sečíst.

## Kde to upravit

- `src/modules/payments/status.ts` – odvození a popisky stavů.
- `src/app/dluhy/[receivableId]/page.tsx` – detail dluhu (platební údaje, hlášení, simulátor).
- `src/app/prehled/page.tsx` – seznam dluhů rodiče.
- `src/app/tymy/[teamId]/page.tsx` – platby k vyřízení v týmovém pohledu rodiče.
- `src/app/demo-banka/[receivableId]/page.tsx` a `src/modules/bank-simulator/service.ts` – simulátor a zobrazení nespárovaných pohybů.
- `src/modules/assessments/service.ts` – dotazy `getGuardianReceivables`, `getGuardianTeamFinance`, `getGuardianReceivable` (přidat čekající částku hlášení a nespárované pohyby).

## Akceptační kritéria

- Rodič u každého dluhu na první pohled vidí Předepsáno / Evidováno / Zbývá a to, co ještě čeká na vyřízení.
- „Nahlášeno“ nebo čekající demo pohyb nikdy nevypadá jako zaplaceno.
- Po potvrzení hlášení správcem se evidovaná částka na obrazovce rodiče změní a čekající štítek zmizí.
- Rozhodnutí o spojení hlášení s demo pohybem (M5) zůstává beze změny; mění se jen zobrazení.
- Nic se nesmaže a žádný finanční záznam se nemění, jen jak se stav ukazuje.

## Pozn.

Změna je v zobrazení a v odvozování stavu, nezasahuje do ukládání plateb (alokace, události, zámky). Před implementací projít `docs/decisions.md` (D-05, D-16) a `docs/design.md` (obrazovky C3/C4/C5).
