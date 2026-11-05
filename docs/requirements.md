# Požadavky a hranice MVP

Zdroj: `zadani.md`, rozhodnutí zadavatele z 2026-11-03, upřesnění pravidla evidence úhrad z 2026-11-04 a orientační prototyp. Tento dokument rozlišuje původní user stories od dohodnutého rozsahu školního demo MVP. ID C, T, K odpovídají původnímu zadání.

## Produkt a role

Mobilně použitelná webová aplikace pro české amatérské sportovní kluby. Eviduje předpisy a platby v CZK; převody směřují přímo na bankovní účet klubu nebo týmu. Aplikace peníze nedrží ani nepřevádí.

| Role | Vstup | Rozsah práv |
| --- | --- | --- |
| Správce klubu | Samostatná registrace a založení klubu s názvem, IČO a číslem účtu | Všechny týmy svého klubu, týmy, trenéři, přesuny členů, celoklubové předpisy a export. Má i práva trenéra. |
| Trenér | Pozvání správcem klubu; v MVP jeden trenér na tým | Jen přidělené týmy: členové, všechny druhy týmových předpisů, ruční evidence úhrad, vyřízení hlášení, hotovost, technické nastavení synchronizace podle práv k účtu a export. |
| Člen/rodič | Pozvánka nebo kód týmu | Jen vlastní sportovci a jejich dluhy/platby; jména spoluhráčů a kontakt na trenéra. |

Účet uživatele není sportovec. Jeden rodič může spravovat více dětí ve více týmech; dospělý sportovec může spravovat sebe. Oprávnění členství a přístupu se vyhodnocují v kontextu týmu. U dítěte se ukládá pouze jméno, příjmení a rok narození; kontakt patří rodiči. Spoluhráčům se nezobrazují kontakty ani platby ostatních.

## Povinné business invarianty

1. Každý předpis vytvoří vybraným sportovcům samostatný dluh. Každý dluh má variabilní symbol jedinečný v rámci cílového bankovního účtu; stejný účet sdílený více týmy znamená společný prostor symbolů.
2. Dluh rozlišuje: čeká, po splatnosti, nahlášeno, částečně zaplaceno, zaplaceno, přeplaceno, odpuštěno/zrušeno. Upomínka není stav. Jednoduché pravidlo přeplatku v demo MVP stanoví D-05.
3. Bankovní účet nemá „ruční“ ani „automatický“ režim. Ruční evidence oprávněnou osobou a bankovní synchronizace či demo simulátor jsou nezávislé způsoby evidence úhrady. Rodič může nahlásit každý nezaplacený dluh; hlášení samo nic nezaúčtuje a smí být odvoláno do vyřízení. Později nalezený bankovní pohyb se nesmí započítat znovu proti již ručně evidované téže úhradě; nejasný případ čeká na ruční rozhodnutí. Simulovaný pohyb je vždy označen jako demo a není bankovně ověřeným převodem. Skutečné Fio a chování při jeho výpadku patří do budoucího rozvoje.
4. Hotovost zapisuje oprávněný trenér nebo správce klubu s datem a je v exportu oddělená od převodu. Nahlášení rodičem není potvrzení přijetí peněz.
5. Odchod nebo vyřazení z týmu nemaže dluhy. Nezaplacený dluh může zrušit oprávněný trenér nebo správce klubu podle D-12. „Smazání“ týmu je archivace se zachováním finanční historie.
6. Upomínky odesílá aplikace neutrálním textem. QR platba je pro CZK. Klubové i týmové předpisy smí vytvořit role určené zadáním bez dělení práv podle typu platby.
7. Přesun sportovce zachovává historii a platby u původního týmu.

U celoklubového předpisu potvrzuje ruční hlášení, zapisuje hotovost a ruší neuhrazený dluh správce klubu; předpis nemá jediný tým, podle kterého by šlo přidělit právo trenérovi (D-12).

## MVP: příběhy označené M

| Oblast | ID | Požadované chování |
| --- | --- | --- |
| Člen/rodič | C1–C3 | Registrace nebo přihlášení z e-mailové pozvánky s přímým vstupem, přístup přes kód po schválení, více sportovců na účtu, souhrn a splatné dluhy. |
| Člen/rodič | C4–C6 | CZK QR s účtem/částkou/VS/zprávou, záložní kopírování údajů, ruční hlášení s odvoláním, sdělení automatické kontroly. |
| Člen/rodič | C7–C9 | Historie a stažitelné potvrzení, tým a spoluhráči v mezích soukromí, odhlášení dítěte s upozorněním na dluhy/kredit. |
| Trenér | T1–T3 | Hromadné pozvání/kód, schvalování žádostí, předpis pro tým či výběr členů a e-mail s QR. |
| Trenér | T4–T6 | Přehled člen × předpis, hromadné potvrzení i zamítnutí s důvodem, zápis hotovosti. |
| Trenér | T7–T9 | V demo MVP technická konfigurace simulované synchronizace, která nevypíná ruční evidenci, čas posledního zpracovaného demo pohybu, fronta nespárovaných či nejednoznačných pohybů s potvrzením vazby, přiřazením nebo rozdělením podle přístupu k účtu a neutrální hromadná upomínka. Skutečný Fio token, test spojení a synchronizace jsou odloženy rozhodnutím D-01. |
| Trenér | T10–T12 | Vyřazení člena bez ztráty dluhu, přepínání týmů, filtry a CSV export. |
| Správce | K1–K5 | Založení klubu/týmů, pozvání trenérů, přehled napříč týmy, přesun člena, klubový export. |
| Průřezově | §2–3 | Celoklubový předpis, archivace týmu, zrušení nezaplaceného dluhu, ochrana soukromí. Tyto body jsou v textu závazné, ale nemají samostatnou M story. |

Označení „Musí být (26)“ odpovídá součtu C1–C9, T1–T12 a K1–K5. Průřezové požadavky jsou navíc. T7 a T8 mají pro schválené demo MVP popsanou simulační variantu, nikoli skutečné Fio. Archivace týmu včetně UI je v MVP podle D-08.

## Po MVP

| Priorita ze zadání | ID | Rozsah |
| --- | --- | --- |
| S | C10–C13 | Předběžná připomínka, export/žádost o výmaz osobních dat, platba dopředu a kredit, pohyby kreditu. |
| S | T13, T15, K7 | Individuální úprava/odpuštění s auditní stopou, kredity a vratky, audit log v UI. |
| P | T14 | Pravidelně generované předpisy. |
| Po demo MVP | část T7 | Skutečné Fio napojení, read-only token, test spojení, pravidelná synchronizace a chování při výpadku. |

Auditní události pro citlivé změny patří do základu MVP; odložené je prohlížení audit logu v UI. Kreditní účetnictví a automatické použití přeplatku nejsou v demo MVP. Ověření bude ruční; žádné automatizované testy se nepíší.

## Pracovní zjednodušení a design

Konkrétní pravidla pro účty, přeplatky, členství a opravy jsou v `docs/decisions.md`. Jde o jednoduché pracovní volby pro školní projekt, nikoli o obecná pravidla finanční aplikace. `docs/design.md` mapuje dodané snímky, navrhuje chybějící stránky a popisuje rozpory prototypu s business zadáním.
# Upřesnění požadavků: identita sportovce při vstupu

- `users`, `athletes` a `memberships` zůstávají oddělené. Vazba účtu na sportovce rozlišuje `self` a `child`; starší nezařazené vazby se nesmějí automaticky rozhodnout podle jména.
- Databáze vynucuje nejvýše jeden profil `self` na uživatele. První vstup za sebe použije jméno účtu, další vstupy používají stejné `athlete_id`.
- Nové dítě má celé jméno a nepovinný rok narození. Výběr existujícího profilu je povolen pouze vlastníkovi vazby; dítě nedostává účet.
- Pozvánka a kód používají stejnou serverovou volbu profilu. Pozvánka se spotřebuje až po úspěšném členství a dál kontroluje e-mail; kód dál vytváří čekající žádost.
- Opakované odeslání nesmí vytvořit druhý osobní profil, stejné nové dítě z jednoho formuláře ani duplicitní aktivní členství či čekající žádost.
- Dluhy, QR a platební komunikace zůstávají na sportovci a jeho spravujícím účtu; změna reprezentace jména nemění existující ID ani finanční historii.

