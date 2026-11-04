## Zadání 
### 1. Manažerské shrnutí
Stavíme webovou aplikaci, používanou hlavně z mobilu, přes kterou amatérské sportovní kluby vybírají
členské příspěvky a další platby, třeba za turnaj nebo soustředění. Správce klubu se sám zaregistruje,
založí týmy a přidá do nich trenéry. Trenér pozve hráče a rodiče, vystaví platbu pro svůj tým a na jedné
obrazovce vidí, kdo zaplatil a kdo ne. Rodič dostane e-mail s QR kódem a zaplatí převodem přímo na
účet klubu. Přijetí platby lze v aplikaci zaevidovat ručně oprávněnou osobou nebo později zjistit bankovní synchronizací (v MVP simulátorem).
Rodičovo „Zaplatil jsem“ je pouze hlášení čekající na vyřízení, nikoli potvrzení přijetí peněz. Peníze přes aplikaci nikdy neprotékají, takže nepotřebujeme platební bránu.
Trenér dobrovolník tak přestane párovat výpis z banky s Excelem a psát trapné upomínky a rodič má
jasný stav „zaplaceno“. Vzhled aplikace je hotový jako klikací prototyp v Lovable. Úkolem vývoje je
postavit podle něj skutečnou aplikaci a napojit ji na backend.

Fotky aplikace z lovable jsou ve složce /prototype-design

### 2. Role
Tři role. Oprávnění se počítá vždy na úrovni týmu, správce klubu má práva trenéra ve všech týmech.

Role	Jak se do aplikace dostane	Co smí
Správce klubu	sám se zaregistruje a založí klub (e-mail, heslo, název klubu, IČO, číslo účtu)	vše v klubu: zakládat a archivovat týmy, zvát trenéry, přesouvat členy mezi týmy, vidět platby všech týmů, celoklubové předpisy, export za klub
Trenér (správce týmu)	vždy ho pozve správce klubu e-mailem a přiřadí k týmu	jen své týmy: zvát a schvalovat členy, vyřadit člena, zakládat jakékoli platby ve svém týmu (příspěvek, turnaj, soustředění), potvrzovat platby, zapsat hotovost, napojit Fio, export za tým
Člen / rodič	jen přes pozvánku nebo kód týmu, při registraci volí „Koho přihlašuji: sebe / dítě“	vidět své týmy, jména spoluhráčů a trenéra, co má zaplatit a co zaplatil, zaplatit přes QR, u nezaplaceného dluhu kliknout „Zaplatil jsem“, odhlásit dítě z týmu
Důležité: účet není člen. Člen je sportovec, často dítě bez vlastního přihlášení. Rodič má jeden účet a spravuje přes něj všechny své děti, i ve více týmech. Dospělý člen spravuje sám sebe.

Práva na platby se nedělí podle druhu platby: trenér zakládá jakékoli platby ve svém týmu, správce klubu ve všech týmech a navíc jednu platbu pro celý klub naráz.

V MVP je na tým jeden trenér (pokladní). 

### 3. Byznysová pravidla
Peníze nikdy přes aplikaci. Platí se převodem na účet týmu nebo klubu. Aplikace eviduje předpisy a způsoby evidence jejich úhrady.
Bankovní účet nemá vzájemně výlučný „ruční“ ani „automatický“ režim. Oprávněná osoba může úhradu zaevidovat ručně; rodič může u nezaplaceného dluhu vždy poslat hlášení „Zaplatil jsem“, které samo přijetí peněz nepotvrzuje. Bankovní synchronizace nebo demo simulátor může později zjistit pohyb na stejném účtu. Tatáž skutečná úhrada se nesmí započítat podruhé; nejasná shoda se předloží oprávněné osobě k ručnímu rozhodnutí. Výpadek integrace nevypíná ruční evidenci.
Předpis a dluh. Předpis (např. „Pololetí jaro 2027“) vytvoří pro každého vybraného člena samostatný dluh s vlastním variabilním symbolem, unikátním v rámci bankovního účtu.
Stavy dluhu: čeká na platbu, po splatnosti, nahlášeno, částečně zaplaceno, zaplaceno, přeplaceno, odpuštěno / zrušeno. Upomínka není stav.
Hotovost: trenér zapíše „Zaplaceno hotově“ s datem, v exportu je odlišená.
Odchod nebo vyřazení z týmu dluh nemaže. Nezaplacené předpisy zůstávají, trenér je může zrušit. (Prototyp je stornuje automaticky, to se mění.)
Smazat tým = archivovat. Platby musí zůstat kvůli účetnictví.
Soukromí: spoluhráči vidí jen jména, nikdy kontakty ani kdo co zaplatil. U dítěte jen jméno, příjmení a rok narození, kontakt je vždy na rodiče.
Upomínky posílá aplikace neutrálním textem, ne trenér svým jménem.
Čeština a koruny. QR Platba funguje jen s CZK.

### 4. Rozsah MVP
Čísla odkazují na user stories v kapitole 03 architektury backendu.

Priorita	Co	User Stories
Musí být (26)	registrace z pozvánky, víc dětí pod jedním účtem, co a do kdy zaplatit, QR, „Zaplatil jsem“, info o automatické kontrole, historie, tým a spoluhráči, odhlášení dítěte	C1 až C9
pozvat tým, schvalovat žádosti, založit předpis, kdo zaplatil, hromadně potvrdit, hotovost, napojit Fio, nespárované platby, upomínka jedním klikem, vyřadit člena, přepínat týmy, export	T1 až T12
založit klub, pozvat trenéry, stav všech týmů, přesun člena, export za klub	K1 až K5
Mělo by	připomínka před splatností, export a výmaz vlastních dat, platba dopředu a kredit, úprava a odpuštění předpisu, vracení kreditů, archivace týmu, audit log v UI	C10 až C13, T13, T15, K6, K7

### 5. User Stories 
Člen / rodič
ID	Jako rodič chci…	Abych…	Akceptační kritéria	Prio
C1	Se zaregistrovat z pozvánky	To zvládl na mobilu za minutu	Odkaz z e-mailu → e-mail a heslo → „Koho přihlašuji“ → člen je v týmu.	M
C2	Přidat další dítě do jiného týmu pod stejným účtem	Měl vše na jednom místě	Přepínač dětí/týmů, souhrn „K zaplacení“ za všechny děti.	M
C3	Vidět, co mám zaplatit a do kdy	Nic nezmeškal	Seznam otevřených předpisů seřazený podle splatnosti, po splatnosti červeně.	M
C4	Zaplatit naskenováním QR kódu	Nemusel opisovat účet a VS	QR platba s částkou, VS a zprávou; tlačítko „Kopírovat údaje“ jako záloha.	M
C5	Oznámit „Zaplatil jsem“	Trenér věděl, že rodič tvrdí, že platbu odeslal	Tlačítko u každého nezaplaceného dluhu; hlášení výslovně není potvrzení přijetí peněz, čeká na vyřízení a jde vzít zpět do vyřízení.	M
C6	Při zapnuté bankovní synchronizaci vědět, že se pohyby kontrolují automaticky	Se nestresoval, že se nic neděje	Info „Kontrolujeme automaticky, propis může trvat“; ruční hlášení zůstává dostupné a e-mail přijde po spárování.	M
C7	Vidět historii zaplacených plateb	Měl důkaz	Datum, částka, způsob, kdo potvrdil; potvrzení ke stažení.	M
C8	Vidět tým, spoluhráče a kontakt na trenéra	Věděl, na koho se obrátit	Jen jména spoluhráčů, žádné platby ostatních.	M
C9	Dítě z týmu odhlásit	Nedostával další předpisy	Potvrzovací dialog upozorní na nezaplacené předpisy, které zůstávají, a na zůstatek kreditu.	M
C10	Dostat připomínku před splatností	Nemusel si to pamatovat	E-mail 3 dny před splatností, jde vypnout.	S
C11	Stáhnout nebo smazat svá data	Měl kontrolu nad údaji dítěte	Export JSON/PDF, žádost o výmaz s vysvětlením, co zůstane kvůli účetnictví.	S
C12	Zaplatit dopředu libovolnou částku, klidně na celý rok	Nemusel platit každé pololetí	„Zaplatit dopředu“ s vlastní částkou nebo nabídkou „Na celý rok“, QR s kreditním VS; předpisy se pak hradí z kreditu samy.	S
C13	Vidět zůstatek kreditu a jeho pohyby	Věděl, kolik mi zbývá	Zůstatek na přehledu každého dítěte, historie připsání a použití, přeplatek se ukáže jako kredit.	S


Trenér / správce týmu
ID	Jako trenér chci…	Abych…	Akceptační kritéria	Prio
T1	Pozvat celý tým najednou	Nemusel každého zadávat	Vložit seznam e-mailů nebo sdílet odkaz/kód týmu do WhatsAppu.	M
T2	Schvalovat žádosti o vstup	Se do týmu nedostal nikdo cizí	Seznam žádostí s jménem dítěte a rodiče, schválit/zamítnout.	M
T3	Založit platbu pro celý tým nebo vybrané členy	Vybral příspěvek za 2 minuty	Název, částka, splatnost, výběr členů; náhled „odejde 18 rodičům“; rodiče dostanou e-mail s QR.	M
T4	Vidět na jedné obrazovce, kdo zaplatil	Nemusel nic párovat	Tabulka člen × předpis se stavy, filtr „jen nezaplacené“, součet vybráno / zbývá.	M
T5	Potvrdit nahlášené platby hromadně	To stihl za minutu	Seznam „K potvrzení“, zaškrtnout více, potvrdit; zamítnutí s důvodem.	M
T6	Zapsat platbu v hotovosti	Měl evidenci kompletní	U předpisu „Zaplaceno hotově“ s datem; v exportu odlišené.	M
T7	Napojit Fio účet	Platby se kontrolovaly samy	Průvodce se screenshoty, kde v Fio vygenerovat token jen pro čtení; test spojení; stav poslední synchronizace.	M
T8	Spárovat platbu, která nepřišla se správným VS	Nic nezapadlo	Fronta „Nespárované“ s návrhem člena, přiřadit nebo rozdělit na více předpisů.	M
T9	Poslat upomínku dlužníkům jedním klikem	Nemusel psát trapné zprávy	„Připomenout všem nezaplaceným“, neutrální text od aplikace, ne od trenéra.	M
T10	Vyhodit člena z týmu	Měl tým aktuální	Potvrzení, rodič dostane oznámení, nezaplacené předpisy zůstanou.	M
T11	Přepínat mezi týmy, kde jsem trenér	Nemusel se odhlašovat	Přepínač v hlavičce, poslední volba se pamatuje.	M
T12	Filtrovat a exportovat příchozí platby za období	Dal podklady hospodářce	Filtr období/stav/způsob, součet, export CSV.	M
T13	Změnit nebo odpustit předpis jednomu členovi	Zohlednil sourozeneckou slevu nebo zranění	Úprava částky s poznámkou, „Odpustit“; záznam v audit logu.	S
T14	Opakovanou platbu (měsíčně)	Nemusel ji zakládat pořád znovu	Šablona s periodou, předpisy vznikají automaticky.	P
T15	Vidět kredity členů a vracet je	Věděl, co klub členům dluží	Seznam zůstatků, „K vrácení“ po odchodu člena, „Vráceno“ s datem, zápis hotovosti na kredit; vše v audit logu.	S


Správce klubu
ID	Jako správce klubu chci…	Abych…	Akceptační kritéria	Prio
K1	Založit klub a své týmy	Mohl začít	Registrace klubu → průvodce: účet, první tým, pozvat trenéry.	M
K2	Pozvat trenéry a přidělit jim tým	Rozdělil práci	Pozvánka e-mailem s rolí; jeden správce na tým, při změně varování.	M
K3	Vidět stav plateb všech týmů	Věděl, kde je problém	Přehled týmů: vybráno / očekáváno / po splatnosti, proklik do týmu.	M
K4	Přesunout člena do jiného týmu	Zvládl přechod mezi kategoriemi	Výběr cílového týmu, historie a platby zůstanou původnímu týmu.	M
K5	Exportovat platby celého klubu za období	Dal podklady účetní	Jeden export se sloupcem tým.	M
K6	Archivovat tým	Uklidil staré sezóny	Tým zmizí z přehledů, data zůstanou v exportech.	Neuvedeno
K7	Vidět audit log	Dohledal, kdo co změnil	Filtr podle týmu, uživatele, typu akce.	S

### 6. Požadavky na architekturu 
Může se jedna o monolit aplikaci BE + FE v jednom stacku. Aplikaci budu nasazovat na AWS, bylo by dobré kdyby vše bylo v dockeru s postgreSQL databází.
Emaily se budou posílat přes resend 

Bankovní pohyby se budou pro školní demo nejspíš simulovat v logicky odděleném modulu, který půjde jednoduše vyjmout nebo nahradit. Standardní CZK QR obsahuje údaje pro skutečný převod přímo na klubový či týmový účet a nikdy neodkazuje na simulátor. Vedle něj může být samostatná jasně označená akce „Simulovat platbu“; ta vytvoří pouze demo pohyb, nikoli bankovně ověřený převod.
