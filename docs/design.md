# Návrh obrazovek a rozložení

Zdroj: osm snímků a `prototype-design/Popis.md` (2026-11-03). Prototyp je orientační vizuální návrh, nikoli závazná specifikace chování. Business pravidla v `zadani.md` a `docs/requirements.md` mají přednost. Zatím jsou k dispozici pouze desktopové snímky; mobilní rozložení níže je návrh pro realizaci.

## Vizuální směr

- Tmavě modrá navigace a výrazné nadpisy, světlé pozadí, bílé karty, modré primární akce. Stavové barvy používají zelenou, oranžovou a červenou spolu s textovým štítkem; samotná barva nesmí nést význam.
- Na široké obrazovce levý navigační panel, horní lišta s kontextem klubu/týmu a hlavní obsah v kartách či tabulkách. Na mobilu se navigace zkrátí do přístupného menu nebo spodní lišty, karty jdou pod sebe a tabulky se změní na řádky s klíčovými údaji a detailem.
- Celé uživatelské rozhraní bude v češtině, částky v Kč a datumy podle českého prostředí. Přepínač „Testing as“ ze snímků není uživatelská funkce; role určuje přihlášení a oprávnění.
- Výrazy v prototypu `Payment event` a `Fee` odpovídají „předpisu“; individuální povinnost je „dluh“. Upomínka je událost, nikoli stav dluhu. Zobrazení „zaplaceno“ musí odlišit ruční potvrzení, hotovost, Fio a historickou demo simulaci.

## Navigační mapa

| Role | Hlavní navigace | Poznámka |
| --- | --- | --- |
| Správce klubu | Přehled klubu, Týmy, Členové, Předpisy a platby, Nastavení | Má i trenérský pohled na týmy; přepnutí nemění jeho oprávnění. |
| Trenér | Přehled týmu, Členové a žádosti, Předpisy, Kdo zaplatil, K potvrzení, Nespárované, Příchozí platby, Nastavení účtu | Přepínač týmů si pamatuje poslední volbu. Nespárované a nastavení účtu jen v rozsahu jeho výhradního týmového účtu; sdílený účet spravuje správce klubu. |
| Člen/rodič | Přehled, Moje týmy, Historie, Účet | Přepínač dětí/týmů a souhrn za všechny děti. |

Adresy z `Popis.md` bereme jako orientační. Konečné URL mohou mít jiný tvar, pokud zachovají přehlednou navigaci a přímý odkaz do detailu.

## Jednotné aplikační záhlaví

- Všechny přihlášené obrazovky používají společné dvouúrovňové záhlaví. Horní řádek je stabilní: značka vede na osobní přehled a napravo je identita účtu s odhlášením. Druhý řádek se zobrazuje jen tehdy, když stránka má konkrétní kontext klubu, týmu nebo pracovního postupu.
- Kontextový řádek ukazuje typ a název objektu, aktuální roli, lokální navigaci a nejvýše jednu primární akci. Odkazy sestavuje server až po kontrole přístupu; záhlaví samo není bezpečnostní hranice.
- Správce klubu vidí v klubovém kontextu přehled, týmy, finance a rychlé založení předpisu. Trenér nebo správce na týmové stránce vidí přehled týmu, hráče, finance, nastavení a nový předpis. Člen nebo rodič na stejném týmu vidí přehled týmu, vlastní platby a vlastní historii; správní odkazy se nezobrazují, pokud k nim nemá oprávnění.
- Na menší obrazovce zůstává značka, účet a kontext viditelný, lokální navigace se posouvá vodorovně a primární akce zůstává samostatně dostupná.

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
| Detail platby rodiče | Částka, splatnost, klub/tým, účet, VS, jediný standardní SPD QR a „Kopírovat údaje“. | U každého nezaplaceného dluhu zůstává „Zaplatil jsem“ a odvolání před vyřízením; text výslovně říká, že jde pouze o hlášení. QR se potvrzuje v bankovní aplikaci a nevede na simulátor. |
| Nastavení bankovního účtu | Údaje účtu a oddělená Fio konfigurace: aktivace v modálu, návod na token „Sledování účtu“, ověření, stav, časy posledního pokusu/úspěchu/nového pohybu, bezpečná chyba, synchronizace nyní, výměna a vypnutí. | Nezobrazovat volbu „ruční / automatický režim“. Zapnutí či výpadek synchronizace nesmí skrýt ruční evidenci ani rodičovské hlášení. UI nesmí tvrdit, že z Fio odpovědi ověřilo výhradně read-only právo. Při změně účtu upozornit, že staré dluhy a QR zachovají původní účet (D-13). |
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
- **Nastavení účtu:** nahoře identita a platební údaje účtu; níže samostatná technická konfigurace Fio a vedle ní vysvětlující panel, že ruční evidence zůstává vždy dostupná. Token se po uložení nikdy znovu nezobrazuje.
- **K potvrzení a Nespárované:** nahoře počet čekajících, filtr týmu a způsobu; pod tím tabulka. Hromadná akce se zpřístupní po výběru položek. Na mobilu každý záznam tvoří karta s částkou, datem, osobou, důvodem a akcemi.
- **Příchozí platby:** filtr období a týmu nad seznamem, součet na samostatné kartě, export vpravo u nadpisu. Na telefonu je export v menu akcí a filtry se rozbalují nad seznamem.

## Mobilní uspořádání a kontrola návrhu

Na šířce telefonu má být nejdůležitější údaj a akce vidět bez vodorovného posouvání: u rodiče částka/splatnost/QR, u trenéra počet čekajících a rychlý přechod do potvrzování, u správce stav týmů. Dlouhé seznamy mají filtry nad obsahem, zřetelný prázdný stav a jasnou zpětnou vazbu po akci. Přístupnost ověřit klávesnicí, čtečkou a dostatečným kontrastem textových stavů. Vizuální věrnost desktopovým snímkům se ověřuje až po opravě rozporů uvedených výše.

## Přihlášený přehled „Moje kluby“

- `/prehled` seskupuje všechny relevantní týmy podle klubu. Jeden tým se zobrazuje právě jednou, i když k němu má účet více vztahů.
- Uvítání doplňuje pouze stručný počet klubů a týmů. Klub už nepoužívá vysoký barevný postranní panel; má kompaktní identifikační záhlaví a pod ním samostatnou mřížku týmů.
- Dlaždice týmu skládá název, všechny role účtu, stav aktivního trenérského týmu, počet členů, trenéra a jasnou hlavní cestu do odpovídajícího detailu. Aktivní tým se odlišuje textem a barvou, nikoli jen barvou.
- Dlaždice týmu ukazuje název, počet aktivních členů, aktivního trenéra a všechny vztahy přihlášeného účtu: vlastník klubu, trenér, člen nebo rodič člena.
- Vlastník klubu vidí všechny aktivní týmy klubu a přechod do správy klubu. Trenér může otevřít tým a nastavit jej jako aktivní. Člen nebo rodič přechází do bezpečného členského detailu bez manažerských akcí.
- Přehled neposílá do klienta soupisku ani kontakty ostatních členů; počet členů a jméno trenéra vrací server jen pro týmy, k nimž má účet autorizovaný vztah.
- Na telefonu se týmové dlaždice skládají do jednoho sloupce, bez vodorovného posouvání.

## Členský detail týmu

- `/tymy/[teamId]` serverově rozlišuje manažerský a členský pohled. Přímá URL bez aktivního členství nebo manažerské role data nezobrazí.
- Člen/rodič vidí název klubu a týmu, kontakt na aktivního trenéra, počet členů a pouze jména spoluhráčů. Kontakty, roky narození a platby ostatních členů zůstávají skryté.
- „Platby k vyřízení“ obsahují pouze týmové dluhy sportovců spravovaných přihlášeným účtem. Akce vede na stávající autorizovaný detail platebních údajů a QR.
- Historie plateb zobrazuje pouze alokace vlastních sportovců v daném týmu, včetně jasně označeného původu evidence a případných opravných protizápisů.
- Správce a trenér nadále dostávají stávající manažerskou správu týmu. Pokud má stejný účet také vlastní členství nebo spravuje člena, může z přehledu otevřít oddělený členský pohled; finanční dotazy se i v něm filtrují jen na jeho sportovce.

## Manažerský detail týmu

- Manažerský `/tymy/[teamId]` začíná modrým týmovým bannerem s rolí uživatele, počtem hráčů, čekajících žádostí a aktivních pozvánek. Hlavní akce vedou přímo k novému předpisu a úplnému finančnímu přehledu.
- Finanční blok ukazuje předepsanou, evidovanou a zbývající částku, průběh úhrad a nejbližší otevřené platby. Účet týmu není součástí tohoto přehledu; je až v rozbalovacím nastavení.
- Soupiska používá jeden profil na hráče. Více spravujících kontaktů se seskupí uvnitř profilu a nezvyšuje počet hráčů.
- Žádosti o vstup jsou samostatná akční fronta a zobrazí se jen tehdy, když skutečně čekají na rozhodnutí.
- E-mailové pozvánky jsou přejmenované na srozumitelné „Přidat členy“. Aktivní pozvánky, týmový kód a účet pro předpisy zůstávají dostupné v pravém pracovním sloupci bez zahlcení hlavního obsahu.

## Manažerské finance týmu a klubu

- `/finance` používá stejnou vizuální hierarchii jako manažerský detail týmu. Tmavě modrý banner nese identitu rozsahu, hlavní akci a souhrn předepsáno, evidováno, zbývá a průběh evidence; nejde o tvrzení bankovně ověřené inkasované částky.
- Předpisy zůstávají hlavním pracovním seznamem. Finanční operace jsou seskupené podle úkolu: synchronizace účtu, demo pohyby k přiřazení, detailní matice člen × předpis, platební hlášení a hromadná upomínka.
- Čekající hlášení používají kompaktní řádky se sportovcem, kontaktem, předpisem, časem a částkou. Potvrzení a zamítnutí zůstává hromadné; text výslovně říká, že potvrzení vytváří evidenci, nikoli bankovní ověření.
- Prázdná fronta pohybů nebo hlášení se zobrazuje jako krátký stav vyřízení, nikoli jako vysoký prázdný panel. Technické demo upozornění zůstává viditelné, ale vizuálně nepřebíjí úkoly uživatele.

# Oprava obrazovek vstupu člena

- `/pozvanka/[token]` a `/vstup` začínají volbou „Vstupuji za sebe“. Je-li osobní profil vytvořený, stránka ukáže jeho jméno; jinak vysvětlí vytvoření z názvu účtu.
- „Přihlašuji dítě“ odkryje výběr spravovaných dětí. Formulář celého jména a nepovinného roku narození se zobrazí pouze po volbě „Přidat další dítě“.
- Nezařazený historický profil lze při osobním vstupu výslovně zvolit jako „To jsem já“; v dětské větvi jej lze výslovně zařadit jako dítě. Rozhraní upozorňuje, že nedochází k automatickému slučování podle jména.
- Výsledek pozvánky říká, že členství je aktivní. Výsledek kódu říká, že žádost čeká na schválení.
- Rodičovský přehled označuje osobní profil, dítě a starší nezařazený profil. Manažerská soupiska u dítěte používá popisek „Účet rodiče“, u dospělého „Vlastní účet“; rok narození se nezobrazuje, pokud chybí.

# Nahrazená veřejná platební stránka z QR

- Tento dřívější návrh nahrazuje D-19. Detail dluhu i e-mail ukazují jediný standardní SPD QR; veřejná stránka ani tlačítko „Otevřít platbu“ se v běžném toku nezobrazují.
- Původní veřejná route je odstraněná; aktivní odkazy revokuje migrace a historické záznamy zůstávají pouze v auditu.

