# Instagram DM – pomalé odosielanie cez Playwright

Posiela direct messages z tvojho existujúceho Instagram účtu cez skutočný
prehliadač (Playwright), nie cez privátne API. Prihlásiš sa raz ručne, session
sa uloží a ďalšie behy ju použijú.

> ⚠️ Automatizácia je v rozpore s podmienkami Instagramu a účet môže byť
> obmedzený aj pri opatrnom používaní. Píš ľuďom, pre ktorých je správa
> relevantná, a limity nezvyšuj.

## 1. Inštalácia (raz)

```bash
cd instagram-dm
npm install
npx playwright install chromium
```

Vyžaduje Node.js 18.17+.

## 2. Prvé prihlásenie (raz)

```bash
npm run login
```

Otvorí sa viditeľné okno prehliadača (headless: false). Prihlás sa ručne,
vrátane 2FA. Keď ťa Instagram pustí na hlavnú stránku, skript sám uloží
session do `auth/storageState.json` a zavrie okno.

`auth/storageState.json` obsahuje tvoje prihlasovacie cookies – nikomu ho
neposielaj a necommituj ho (je v `.gitignore`). Keď session vyprší, skript
sa zastaví a stačí znova spustiť `npm run login`.

## 3. Ciele

```bash
cp targets.example.json targets.json
```

Stačí zoznam handle-ov. Každý dostane predvolenú správu
`hey i love your vids keep it up!` (zmeníš ju v `src/config.js`,
položka `defaultMessage`):

```json
[
  "creator_handle",
  "@another_creator",
  { "handle": "third_creator", "message": "custom message just for this one" }
]
```

- `handle` môže byť s `@` aj bez neho.
- Objekt s `message` prepíše predvolenú správu len pre daný profil.
- Nový riadok v správe zapíš ako `\n` (napíše sa cez Shift+Enter).
- `npm run check` skontroluje súbor a povie, koľko cieľov ešte čaká.

## 4. Odosielanie

Najprv test na 1–2 profiloch – správu napíše, ale **neodošle** (vymaže ju):

```bash
npm run send:dry -- --limit 2
```

Ostrý beh:

```bash
npm run send                 # viditeľný prehliadač (odporúčané)
npm run send -- --headless   # bez okna
npm run send -- --limit 10   # menej ako 30 správ
```

Ctrl+C zastaví beh po dokončení aktuálneho kroku (rozpísaná správa sa
nedoťukne naslepo), druhé Ctrl+C ukončí okamžite.

## Čo skript robí a aké má limity

| Pravidlo | Hodnota |
|---|---|
| Pauza medzi správami | náhodne 90–180 s |
| Po každých 5 odoslaných | navyše 5 min pauza |
| Max. na jeden beh | 30 správ (`--limit` vie len znížiť) |
| Písanie | znak po znaku, 60–190 ms + občasné „zamyslenie“ |
| Po preskočení / zlyhaní | pauza 30–60 s |
| 3 zlyhania po sebe | beh sa ukončí |
| Opakovaný beh | komu už bolo `SENT`, tomu sa znova nepíše |

Nastavenia sú v `src/config.js`.

### Okamžité bezpečné ukončenie

Beh sa hneď zastaví (zavrie prehliadač, neuloží session, uloží snímku do
`screenshots/`, zapíše `ABORTED` do logu a výrazne ťa upozorní v termináli), keď:

- Instagram chce **overenie** – checkpoint, challenge, 2FA, „Confirm it's you“,
- ťa **odhlási** (session vypršala),
- príde **action block** – „Try again later“, „We restrict certain activity“…,
- sú **správy blokované** – „You can't message this account“, „Not delivered“…,
- narazí na **súkromný (uzavretý) profil**.

Po takom zastavení skontroluj účet ručne a dopraj mu aspoň 24–48 h pokoj.

Chceš upozornenie aj na mobil? Nastav webhook (Slack, Discord, ntfy.sh…):

```bash
ALERT_WEBHOOK_URL="https://ntfy.sh/moj-tajny-kanal" npm run send
```

Namiesto pribaleného Chromia môžeš použiť nainštalovaný Chrome:
`BROWSER_CHANNEL=chrome` (rovnako pre `login` aj `send`).

### Preskočené profily

Neexistujúci profil alebo profil bez tlačidla „Message“ sa zapíše ako
`SKIPPED` a pokračuje sa ďalším.

## sent.log

Jeden riadok na udalosť, oddelené tabulátorom:

```
2026-09-24T10:15:02.114Z	SENT	creator_handle
2026-09-24T10:18:40.901Z	SKIPPED	another_creator	profil neexistuje
2026-09-24T10:20:11.300Z	FAILED	third_one	nepodarilo sa otvoriť okno konverzácie [screenshots/…png]
2026-09-24T10:21:05.000Z	ABORTED	-	action_block: Instagram: "Try again later" (…)
```

## Štruktúra

```
src/login.js      ručné prihlásenie → auth/storageState.json
src/send.js       hlavný beh: rad, limity, pauzy, zastavenie
src/instagram.js  práca so stránkou + detekcia overenia/blokov
src/config.js     všetky limity a cesty
src/logger.js     sent.log
src/notify.js     upozornenie pri ukončení
src/targets.js    načítanie a validácia targets.json
```

Instagram mení svoje UI – ak skript prestane nachádzať tlačidlo „Message“
alebo pole na písanie, uprav selektory v `src/instagram.js` (texty sú
v objekte `TEXT`, blokujúce hlášky v `BLOCKERS`).
