# Backendové zadání: finanční data detailu předpisu

## Cíl

Rozšířit `getAssessmentManagerView(userId, assessmentId)` tak, aby detail
předpisu mohl pravdivě zobrazit očekávanou, evidovanou a zbývající částku,
odvozený stav každého dluhu a poslední finanční aktivitu. Stav doručení e-mailu
a upomínka musí zůstat oddělené od stavu úhrady.

## Stávající stav

Služba nyní vrací metadata předpisu a u každého dluhu jméno sportovce, VS,
kontakt rodiče a stav doručení prvního e-mailu. Nevrací alokace, odvozený stav
dluhu, čekající rodičovské hlášení, poslední platební událost ani upomínku.

## Požadovaný datový kontrakt

```ts
type AssessmentManagerView = {
  id: string;
  clubId: string;
  teamId: string | null;
  clubName: string;
  teamName: string | null;
  title: string;
  amountHalere: number;
  dueDate: string;
  accountNumber: string;
  paymentMessage: string;
  summary: {
    expectedHalere: number;
    allocatedHalere: number;
    remainingHalere: number;
    paidCount: number;
    partialCount: number;
    openCount: number;
    overpaidCount: number;
  };
  debts: Array<{
    id: string;
    athleteId: string;
    athleteName: string;
    guardianEmail: string;
    variableSymbol: string;
    amountHalere: number;
    allocatedHalere: number;
    remainingHalere: number;
    status: "open" | "overdue" | "partial" | "paid" | "overpaid";
    hasPendingClaim: boolean;
    latestPayment: null | {
      kind: "manual_claim" | "cash" | "simulated" | "correction";
      amountHalere: number;
      occurredOn: string;
      actorDisplayName: string | null;
    };
    latestReminder: null | {
      attemptedAt: string;
      deliveryStatus: "pending" | "sending" | "sent" | "failed";
    };
    initialDeliveryStatus: string | null;
    initialDeliveryError: string | null;
  }>;
};
```

## Business a bezpečnostní pravidla

- Zachovat současnou serverovou autorizaci: týmový předpis přes
  `requireTeamManagementAccess`, celoklubový přes `requireClubAdminAccess`.
- Evidovaná částka je výhradně součet append-only `payment_allocations`, včetně
  záporných korekčních alokací. Nesmí se odvozovat ze stavů e-mailu, hlášení ani
  demo pohybu bez alokace.
- Stav dluhu odvodit stejnou doménovou funkcí jako finanční přehled, včetně
  pražského dne, částečné úhrady a přeplatku.
- Čekající rodičovské hlášení je samostatný příznak a samo nemění evidovanou
  částku ani stav na „zaplaceno“.
- Upomínka je poslední pokus o doručení, nikoli stav dluhu.
- `latestPayment.kind=simulated` musí být v UI i exportech označený jako demo;
  nejde o bankovně ověřený převod.
- Dotaz musí být omezený na konkrétní autorizovaný předpis. Osobní a platební
  údaje se nesmí vrátit uživateli mimo jeho klubový nebo týmový rozsah.

## Technické požadavky

- Načíst součty a poslední události hromadně, ne N+1 dotazem pro každý dluh.
- Souhrn předpisu odvodit ze stejných řádků jako seznam dluhů, aby se hodnoty
  nemohly rozcházet.
- Zachovat audit `assessment.financial_details_viewed` bez zapisování citlivých
  platebních údajů do detailu auditu.
- Stávající retry prvního e-mailu musí nadále používat stejné delivery ID a
  idempotency pravidla.

## Akceptační kritéria

- Součet `allocatedHalere` v hlavičce odpovídá součtu zobrazených dluhů.
- Částečná úhrada, úplná úhrada, přeplatek a korekce se projeví shodně jako ve
  finanční matici.
- Čekající hlášení rodiče se zobrazí, ale nezvýší evidovanou částku.
- Neúspěšná upomínka ani neúspěšný prvotní e-mail nezmění stav dluhu.
- Cizí tým, rodič a jiný klub obdrží stejnou bezpečnou odpověď jako v současné
  autorizaci a nezískají seznam adresátů ani platební údaje.
