# Návrh obrazovek a rozložení

Zdroj: osm snímků a `prototype-design/Popis.md` (2026-11-03). Prototyp je orientační vizuální návrh, nikoli závazná specifikace chování. Business pravidla v `zadani.md` a `docs/requirements.md` mají přednost. Zatím jsou k dispozici pouze desktopové snímky; mobilní rozložení níže je návrh pro realizaci.

## Vizuální směr

- Tmavě modrá navigace a výrazné nadpisy, světlé pozadí, bílé karty, modré primární akce. Stavové barvy používají zelenou, oranžovou a červenou spolu s textovým štítkem; samotná barva nesmí nést význam.
- Na široké obrazovce levý navigační panel, horní lišta s kontextem klubu/týmu a hlavní obsah v kartách či tabulkách. Na mobilu se navigace zkrátí do přístupného menu nebo spodní lišty, karty jdou pod sebe a tabulky se změní na řádky s klíčovými údaji a detailem.
- Celé uživatelské rozhraní bude v češtině, částky v Kč a datumy podle českého prostředí. Přepínač „Testing as“ ze snímků není uživatelská funkce; role určuje přihlášení a oprávnění.
- Výrazy v prototypu `Payment event` a `Fee` odpovídají „předpisu“; individuální povinnost je „dluh“. Upomínka je událost, nikoli stav dluhu. Zobrazení „zaplaceno“ musí odlišit ruční potvrzení, hotovost a demo simulaci.

## Navigační mapa

| Role | Hlavní navigace | Poznámka |
| --- | --- | --- |
| Správce klubu | Přehled klubu, Týmy, Členové, Předpisy a platby, Nastavení | Má i trenérský pohled na týmy; přepnutí nemění jeho oprávnění. |
| Trenér | Přehled týmu, Členové a žádosti, Předpisy, Kdo zaplatil, K potvrzení, Nespárované, Příchozí platby, Nastavení účtu | Přepínač týmů si pamatuje poslední volbu. Nespárované a nastavení účtu jen v rozsahu jeho výhradního týmového účtu; sdílený účet spravuje správce klubu. |
| Člen/rodič | Přehled, Moje týmy, Historie, Účet | Přepínač dětí/týmů a souhrn za všechny děti. |

Adresy z `Popis.md` bereme jako orientační. Konečné URL mohou mít jiný tvar, pokud zachovají přehlednou navigaci a přímý odkaz do detailu.

## Existující snímky

| Podklad | Stránka a rozložení | Převzít / změnit |
| --- | --- | --- |
| [club.png](../prototype-design/club.png) | Správce: horní souhrn týmů/členů/trenérů, pod ním karty týmů s trenérem, počtem členů a akcí „Nový tým“. | Zachovat karty a rychlou cestu do týmu; v MVP jeden aktivní trenér na tým. Přidat stav plateb týmů podle K3. |
| [club-members.png](../prototype-design/club-members.png) | Správce: filtr týmu, hledání, tabulka členů, týmů, rolí a akce „Spravovat“. | Rozlišit sportovce od účtu rodiče. E-mail sportovce na snímku je chybný vzor pro děti; zobrazit pouze oprávněně dostupný kontakt rodiče. Přesun ponechá staré dluhy původnímu týmu. |
| [admin.png](../prototype-design/admin.png) | Trenér: čtyři souhrnné karty, otevřené předpisy a čekající žádosti; výrazná akce vytvoření předpisu. | Souhrn omezit na vybraný tým nebo trenérovy týmy, nikoli bez oprávnění celý klub. Vybráno/očekáváno počítat ze skutečných evidovaných plateb; demo označit. |
| [admin-teams.png](../prototype-design/admin-teams.png) | Trenér: přepínač týmů v horní řadě, žádosti, soupiska a zvací odkaz/kód. | E-mailová pozvánka dává přímý vstup po registraci/přihlášení; žádosti z veřejného kódu trenér schvaluje. U dětí je kontakt rodiče, ne e-mail dítěte. |
| [admin-fees.png](../prototype-design/admin-fees.png) | Trenér: tabulka předpisů, termín, částka na člena a průběh inkasa; filtr týmu. | Umožnit i předpis vybraným členům a celoklubový předpis správce. V mobilu karta předpisu s částkou, splatností a přehledem stavu. |
| [admin-fees-id.png](../prototype-design/admin-fees-id.png) | Detail předpisu: hlavní záhlaví, souhrny očekáváno/vybráno/zbývá, filtry členů a seznam s akcí. | „Reminder sent“ je údaj o upomínce, ne stav. „Mark paid“ rozdělit na potvrzení hlášení, zápis hotovosti či přiřazení synchronizovaného pohybu. Tyto způsoby nejsou režimy účtu. Přidat částečnou úhradu a jasný původ platby. |
| [MyMember.png](../prototype-design/MyMember.png) | Rodič: uvítání, celková dlužná částka, karty otevřených předpisů a historie. | Přepínač dětí a týmů, otevřené předpisy seřazené podle splatnosti a QR detail. Historie ukáže datum, částku, způsob, potvrzujícího aktéra a stažení potvrzení evidence. Částky v Kč; tlačítko „Zaplatit“ neprovádí převod v aplikaci. Stav „upomínka odeslána“ vyjmout ze stavů platby. |
| [MyMember-team.png](../prototype-design/MyMember-team.png) | Rodič: každému týmu blok trenéra, informace o týmu, seznam spoluhráčů a „Odejít z týmu“. | Jen jména spoluhráčů, bez kontaktů a plateb. Člen vidí e-mail trenéra. Odchod potvrdí trvající dluhy; kreditní upozornění až při existenci kreditní funkce. |

## Chybějící obrazovky k doplnění

| Stránka | Hlavní obsah a pořadí na mobilu | Akce a stavy |
| --- | --- | --- |
| Domovská stránka | Minimalistický dvousloupcový vstup: stručné vysvětlení produktu a akce vlevo, jediný ilustrační motiv klubové evidence vpravo. Na telefonu nejprve sdělení a akce, potom přehled. | Nepřihlášený uživatel přejde k registraci nebo přihlášení; přihlášený přímo do přehledu nebo se odhlásí. Vždy viditelně uvést, že aplikace peníze neposílá ani nepřijímá a pouze eviduje jejich stav. |
| Registrace klubu | Krátký průvodce: účet správce → název klubu, IČO a bankovní účet → první tým → volitelné pozvání trenéra → souhrn. | Validace formulářů a možnost pokračovat v nedokončeném kroku. Nepředpokládat druhý bankovní účet. |
| Vstup člena/rodiče | Odkaz z e-mailu či zadání týmového kódu → registrace nebo přihlášení → volba „sebe / dítě“ → základní údaje sportovce. Samostatný reset hesla. | Platná jednorázová e-mailová pozvánka aktivuje členství účtu se shodnou adresou bez dalšího kroku. Kód vytvoří žádost a čeká na schválení; nikdy nepřevezme existujícího sportovce podle jména. Neplatná/propadlá pozvánka vysvětlí další krok. |
| Vytvoření předpisu | Název, částka v Kč, splatnost, cílový účet, výběr členů, souhrn adresátů a náhled e-mailu/QR. | Trenér pro svůj tým, správce také pro celý klub. Potvrzení před odesláním. |
| Detail platby rodiče | Částka, splatnost, klub/tým, účet, VS, QR Platba a „Kopírovat údaje“. | U každého nezaplaceného dluhu „Zaplatil jsem“ a odvolání před vyřízením; text výslovně říká, že jde pouze o hlášení a ne o potvrzení přijetí peněz. Pokud je nakonfigurován demo simulátor, samostatná jasně označená akce „Simulovat platbu“ stojí vedle bankovního QR a upozorňuje, že skutečný převod se v demu neověří. Obě akce mohou být dostupné současně. |
| Nastavení bankovního účtu | Údaje účtu a oddělená technická konfigurace demo synchronizace; informační průvodce pro budoucí Fio s obrázky, test spojení a čas poslední kontroly, až bude skutečné Fio implementováno. | Nezobrazovat volbu „ruční / automatický režim“. Zapnutí či výpadek synchronizace nesmí skrýt ruční evidenci ani rodičovské hlášení. V demo MVP žádný skutečný Fio token ani falešný „test spojení s Fio“. U simulátoru zobrazit čas posledního zpracovaného demo pohybu. Při změně výchozího či týmového účtu upozornit, že staré dluhy a QR zachovají původní účet (D-13). |
| K potvrzení | Seznam hlášení „Zaplatil jsem“, jméno sportovce, předpis, částka a datum hlášení; výběr více řádků. | Potvrdit hromadně nebo zamítnout s důvodem bez ohledu na technickou konfiguraci účtu. Text upozorní, že potvrzení vytváří ruční evidenci, nikoli bankovní ověření. Trenér vidí své týmové dluhy, správce klubu i celoklubové dluhy podle D-12. |
| Kdo zaplatil | Matice člen × předpis pro vybraný tým, nad ní součet vybráno/zbývá a filtr „jen nezaplacené“. Na mobilu seznam členů s rozbalenými předpisy. | Každá buňka ukáže skutečný stav dluhu a jeho původ; upomínka je samostatný údaj. Proklik vede na detail předpisu nebo platby. |
| Nespárované platby | Příchozí demo pohyby bez správného VS, s rozdílnou částkou nebo s možnou shodou na čekající hlášení či ručně evidovanou úhradu; navržený člen a důvod, proč se pohyb nezaúčtoval automaticky. | Spojit s existující událostí bez nové alokace, označit jako jinou platbu, přiřadit nebo rozdělit pouze nealokovanou část. Nepřidělená část zůstává viditelná. U sdíleného účtu jen správce klubu. |
| Příchozí platby | Filtry období, týmu, stavu a způsobu; součet a seznam pohybů s detailním zdrojem. | CSV export (text v `Popis.md` končí „export C“; podle T12/K5 jde o CSV). Trenér pouze svůj tým, správce celý klub. |
| Správa členství | Detail sportovce s týmy a aktivním členstvím; správce volí cílový tým při přesunu, trenér vyřazení ze svého týmu, rodič odchod vlastního dítěte. | Před potvrzením ukázat dopad na nové předpisy a trvání starých dluhů; přesun nevrací staré platby do nového týmu. Vyřazení oznámit rodiči. |
| Zrušení neuhrazeného dluhu | Detail dluhu s částkou, původním týmem nebo štítkem „Celý klub“, evidovanými úhradami a důvodem zrušení. | Jen neuhrazený dluh a oprávněný aktér podle D-12; potvrzení výslovně zachová historii a vytvoří auditní záznam. |
| Archivace týmu | Správa týmu se souhrnem členů, otevřených dluhů a odkazem na historii/export. | Správce klubu potvrdí archivaci s upozorněním, že tým zmizí z aktivních přehledů, ale finanční historie zůstane dostupná. |

## Rozložení doplněných stránek na široké obrazovce

- **Domovská stránka:** vlevo výrazný typografický nadpis s nejvýše dvěma akcemi, vpravo jedna kompaktní ukázka klubové evidence. Bez statistik, marketingových sekcí a dalších dekorativních karet; identitu nese modrá plocha přehledu, zbytek stránky zůstává klidný.
- **Průvodce registrací:** uprostřed úzký formulář, nad ním čtyři kroky a pod ním tlačítka Zpět/Pokračovat. Na telefonu kroky zůstanou textově označené a formulář vyplní dostupnou šířku.
- **Nastavení účtu:** nahoře identita a platební údaje účtu; níže samostatná technická konfigurace synchronizace a vedle ní vysvětlující panel, že ruční evidence zůstává vždy dostupná. Budoucí průvodce Fio je jasně označený jako nedostupná budoucí funkce, aby nevzbuzoval dojem aktivního propojení.
- **K potvrzení a Nespárované:** nahoře počet čekajících, filtr týmu a způsobu; pod tím tabulka. Hromadná akce se zpřístupní po výběru položek. Na mobilu každý záznam tvoří karta s částkou, datem, osobou, důvodem a akcemi.
- **Příchozí platby:** filtr období a týmu nad seznamem, součet na samostatné kartě, export vpravo u nadpisu. Na telefonu je export v menu akcí a filtry se rozbalují nad seznamem.

## Mobilní uspořádání a kontrola návrhu

Na šířce telefonu má být nejdůležitější údaj a akce vidět bez vodorovného posouvání: u rodiče částka/splatnost/QR, u trenéra počet čekajících a rychlý přechod do potvrzování, u správce stav týmů. Dlouhé seznamy mají filtry nad obsahem, zřetelný prázdný stav a jasnou zpětnou vazbu po akci. Přístupnost ověřit klávesnicí, čtečkou a dostatečným kontrastem textových stavů. Vizuální věrnost desktopovým snímkům se ověřuje až po opravě rozporů uvedených výše.
