# Rozhodnutí projektu

Stav k 2026-11-03. `Schváleno zadavatelem` je výslovná volba. `Pracovní pravidlo` je zjednodušení pro školní projekt na základě zadavatelova pokynu domyslet zbývající detaily; Lead Agent ho může upravit, pokud narazí na konkrétní rozpor. Ani pracovní pravidlo nesmí změnit základní pravidlo, že peníze přes aplikaci neprotékají.

## Architektura a proces

| ID | Stav | Rozhodnutí |
| --- | --- | --- |
| A-01 | Schváleno zadavatelem | TypeScript, Next.js, PostgreSQL a Docker; modulární monolit bez dalších aplikačních služeb. |
| A-02 | Pracovní pravidlo | Doménová logika mimo UI a HTTP handlery; bankovní adaptér za rozhraním. E-mail odeslat přes Resend po DB zápisu, chybu doručení uložit pro ruční opakování. Bez fronty a samostatného workeru v demo MVP. |
| A-03 | Schváleno zadavatelem | Nasazení: stáhnout repozitář na vlastní server a spustit přes Docker Compose. ECS, RDS a další spravované AWS služby nejsou součástí projektu. |
| A-04 | Schváleno zadavatelem | Lead Agent vždy navrhuje, implementuje, sjednocuje a dokumentuje. Subagenti pouze nezávisle kontrolují; soubory neupravují. Nikdy nepsat automatizované testy. Ověření je ruční průchod scénářů a kontrola build/lint/migrací. |

## Produktová pravidla MVP

| ID | Stav | Rozhodnutí a důvod |
| --- | --- | --- |
| D-01 | Schváleno zadavatelem | MVP používá demo simulátor banky. Skutečné Fio API a práce s jeho tokenem jsou mimo MVP. Obrazovka Fio průvodce může být navržena, nesmí předstírat funkční napojení. Demo instalace se nesmí vydávat za ostré automatické ověření převodů. |
| D-02 | Pracovní pravidlo | Standardní CZK QR ukazuje platební údaje konfigurovaného účtu; vedle něj je samostatné jasně označené tlačítko „Simulovat platbu“. QR nikdy nevede na simulátor. Demo stránka u QR upozorní, že skutečný převod se v aplikaci neověří. Simulovaná úhrada je jako demo označená v UI, e-mailu, potvrzení a exportu. |
| D-03 | Pracovní pravidlo | Klub zadává jeden výchozí účet. Tým může později nastavit vlastní účet; více týmů smí sdílet klubový účet. Stejné normalizované číslo účtu nelze v demu registrovat pod různými kluby. VS je unikátní na fyzický účet napříč klubovými i týmovými dluhy. U sdíleného účtu vidí nespárované syrové pohyby a mění režim pouze správce klubu; trenér vidí vlastní spárované platby a ruční hlášení. U výhradního týmového účtu může trenér zpracovat nespárované pohyby. Celoklubový předpis používá výchozí účet, každému unikátnímu sportovci vystaví jeden dluh a v exportu má tým „Celý klub“; spravuje jej klubový správce. |
| D-04 | Schváleno zadavatelem + pracovní detail | Platná e-mailová pozvánka dá po registraci nebo přihlášení přímý přístup do týmu bez schvalování. Jednorázový odkaz doručený na pozvanou adresu slouží jako ověření držení adresy; e-mail účtu se musí shodovat s pozvánkou, další ověřovací krok není. Přeposlaný odkaz může před vypršením využít jiný držitel, proto má krátkou platnost, jednorázové použití a možnost zrušení. Vstup přes sdílený týmový kód vytvoří žádost ke schválení trenérem. Přesnou délku platnosti zvolí Lead Agent při implementaci. |
| D-05 | Pracovní pravidlo | Částečné úhrady se evidují; částka přiřazená nad výši dluhu vede ke stavu „přeplaceno“, ale automaticky nezakládá kredit. Nepřiřazená část pohybu zůstává ve frontě do ručního rozhodnutí správce. Potvrzení je potvrzení evidence v aplikaci, nikoli daňový doklad. Omyly se opravují novou auditovanou korekcí, ne mazáním historie. V demo MVP se režim účtu po vystavení prvního dluhu nemění; migrace na skutečné Fio vyžaduje samostatný návrh, aby se platba nezaúčtovala dvakrát. |
| D-06 | Pracovní pravidlo | V MVP má sportovec jednoho spravujícího uživatele. Pozvánka nebo schválený kód dovolí vytvořit nového sportovce pod přihlášeným účtem; samotná shoda jména nikdy nepřiřadí existující záznam jinému uživateli. Přesun existujícího sportovce mezi týmy provádí správce klubu, vlastník účtu se nemění. Kontakt na trenéra pro členy je jeho e-mail. Formální ověření zákonného zástupce není funkcí školního dema. Další opatrovníci až po MVP. |
| D-07 | Pracovní pravidlo | Demo používá syntetická data, žádné skutečné údaje dětí ani živé bankovní tokeny. Skutečný provoz by před spuštěním vyžadoval samostatně určit správce dat, retenční lhůty a postup výmazu; školní demo tuto připravenost nedeklaruje. |
| D-08 | Pracovní pravidlo | Správce klubu může v MVP tým archivovat. Archivovaný tým zmizí z aktivních přehledů, ale historie a export zůstávají dostupné oprávněným osobám. |
| D-09 | Dodáno zadavatelem | `prototype-design/Popis.md` a osm snímků jsou orientační podklad. Popis stránek a oprav rozporů je v `docs/design.md`; chybějící obrazovky se doplní při implementaci. |
| D-10 | Pracovní pravidlo | Přesun člena provede správce klubu přímo. Původní dluhy a platby zůstanou u starého týmu, nové předpisy vznikají jen na základě nového výběru; žádné automatické přeúčtování. |
| D-11 | Pracovní pravidlo | V MVP má klub jednoho správce, tým nejvýše jednoho aktivního trenéra. Správce může trenéra vyměnit s varováním, historické akce zůstávají přiřazené původnímu aktérovi. |
| D-12 | Pracovní pravidlo | Ruční hlášení, hotovost a zrušení neuhrazeného dluhu u celoklubového předpisu vyřizuje pouze správce klubu. Celoklubový dluh nemá týmový původ a nelze jej automaticky přidělit jednomu trenérovi; týmové dluhy nadále spravuje trenér svého týmu nebo správce klubu. |
| D-13 | Pracovní pravidlo | Změna výchozího klubového či týmového bankovního účtu platí jen pro nově vystavené dluhy. Již vystavený dluh si ponechá původní účet, VS a QR platební údaje; použitý účet se z historie nemaže. Režim účtu s vystavenými dluhy zůstává neměnný podle D-05. |

## Vědomé rozdíly proti prototypu a původnímu seznamu

- Prototyp používá angličtinu a eura; produkt používá češtinu a Kč.
- Prototyp ukazuje e-mail u hráče, ale u dítěte je kontakt vždy na rodiče. Spoluhráči nevidí cizí kontakty ani platby.
- „Upomínka odeslána“ na snímku není stav dluhu. Odchod z týmu neruší dluh automaticky.
- T7 v původním zadání počítá s průvodcem a skutečným Fio tokenem. Ve schváleném demo MVP se ukáže pouze simulační režim a připravený informační návrh obrazovky Fio; skutečné napojení je budoucí rozvoj.
- T8 se u sdíleného účtu vykonává správcem klubu kvůli izolaci dat týmů. Trenér ji může vykonat u výhradního účtu svého týmu.
- C9 zmiňuje kredit, ale C12/C13 jej řadí až po MVP. Bez kreditní funkce se při odchodu zobrazuje upozornění na trvající dluhy, nikoli vymyšlený zůstatek kreditu.
