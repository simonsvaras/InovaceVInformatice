# Backendové zadání: přehled správce klubu

## Cíl

Doplnit serverově autorizovaný datový model pro stránku `/kluby/[clubId]`, aby
správce viděl skutečné počty členů klubu a jednotlivých týmů. UI nesmí tyto
hodnoty dopočítávat z neúplných seznamů ani načítat každý tým samostatným
dotazem.

## Stávající stav

`getClubAdminDashboard(userId, clubId)` dnes po ověření správce vrací klub,
výchozí účet a aktivní týmy s aktuálním trenérem. Nevrací počty aktivních
členství, počet unikátních sportovců v klubu ani počet správců klubu.

## Požadovaný výstup

Rozšířit návratový typ služby přibližně na tento tvar:

```ts
type ClubAdminDashboard = {
  id: string;
  name: string;
  ico: string;
  accountNumber: string;
  summary: {
    activeTeamsCount: number;
    activeAthletesCount: number;
    staffedTeamsCount: number;
    clubAdminsCount: number;
  };
  teams: Array<{
    id: string;
    name: string;
    activeMemberCount: number;
    coach: null | {
      userId: string;
      displayName: string;
      email: string;
    };
  }>;
};
```

## Pravidla výpočtu

- Autorizaci vždy provést přes `requireClubAdminAccess(userId, clubId)` před
  čtením klubových dat.
- Do `activeTeamsCount` a seznamu zahrnout pouze týmy bez `archived_at`.
- `activeMemberCount` týmu je počet členství daného týmu bez `ended_at`.
- `activeAthletesCount` klubu je počet unikátních `athlete_id` napříč aktivními
  členstvími aktivních týmů. Sportovec ve dvou týmech se v klubovém souhrnu
  počítá jednou, v každém týmovém počtu však jednou.
- `staffedTeamsCount` je počet aktivních týmů s právě jedním aktivním záznamem
  v `team_coaches`; musí respektovat existující invariant jednoho aktivního
  trenéra týmu.
- `clubAdminsCount` vychází ze skutečných aktivních vazeb `club_admins`, nikoli
  z pevné hodnoty v UI.
- Účet vracet stejným způsobem jako dnes; změna účtu nesmí měnit historické
  platební údaje již vystavených dluhů podle D-13.

## Technické požadavky

- Nepoužívat N+1 dotazy pro počty členů jednotlivých týmů. Použít agregaci nad
  členstvími a připojit ji k týmům nebo načíst všechny agregace jedním
  klubově omezeným dotazem.
- Zachovat serverové omezení na `clubId`; klient nesmí dodat nebo odvodit
  souhrny jiného klubu.
- Nevracet osobní údaje členů pro souhrnné karty. Pro tuto obrazovku stačí
  agregované počty.
- Rozvrh tréninků není v aktuálním schématu ani schváleném rozsahu. Nemá se
  přidávat jen kvůli vizuální referenci bez samostatného business rozhodnutí.

## Akceptační kritéria

- Správce u každého aktivního týmu vidí správný počet aktivních členství.
- Klubový počet sportovců neduplikuje sportovce, který je ve více týmech.
- Archivovaný tým a ukončené členství se do souhrnů nepočítají.
- Cizí správce ani trenér bez klubové správní role data touto službou nezíská.
- Prázdný klub vrací nulové hodnoty a prázdný seznam, nikoli chybu.
- Existující vytvoření týmu a pozvání či výměna trenéra zůstávají funkční a po
  změně se souhrny odvodí z aktuálního stavu databáze.
