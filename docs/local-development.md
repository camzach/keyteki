# Local Development

Keyteki is a KeyForge puzzle server and client. The server (`server/`) hosts
puzzle games over socket.io and serves the React client (`client/`). There are
no accounts, databases or other services to run.

## Setup

```bash
npm ci
npm start        # dev server with Vite HMR on http://localhost:4000
```

Set `PORT` to change the port. With `NODE_ENV=production` the server serves
the built client from `dist/` instead (`npm run build` first).

## Sessions

There is no login. On first load the client generates a random token, keeps it
in `sessionStorage` and sends it when connecting. The server accepts any token
matching `/^[A-Za-z0-9_-]{16,128}$/` and names the player `Guest-` plus the
first six hex characters of its SHA-256. Reloading the page reconnects to the
same puzzle; a new tab or browser session is a new player.

## Commands

```bash
npm test                 # all tests (engine, cards, puzzles, scenario server)
npm run lint             # prettier + eslint
npm run typecheck:client
npm run build            # production client build into dist/
```

Card data is read from `master-vault-data/packs/*.json`. Card images are not in
git; download them into `public/img/cards/<id>.png` (about 750MB) with:

```bash
npm run images                 # every card, skipping ones already downloaded
npm run images -- anger troll  # only these card ids
npm run images -- --force      # download again
```

The board works without images, but cards show as blanks.

## Puzzle scenarios

Open the site, paste a base64 (or URL-safe base64) scenario code, review the
preview, and click **Launch Scenario**. The server decodes and validates the
code, builds the board, and the player joins the game immediately as the
active player.

A scenario code can also be passed in a link, e.g. `http://localhost:4000/?code=<code>`.
The puzzle starts immediately, without showing the code. If the code is invalid, the page
falls back to the form with the error. URL-safe codes (the default export) need no
escaping; for standard base64, percent-encode the code (`+` as `%2B`).

The opponent is an inert placeholder (`Puzzle Opponent`), so puzzles must be
solvable within the creator's turn. Puzzle games are private, never recorded, and
cannot be rematched.
A puzzle is solved when its `goal` is met (by default: forging a key beyond those
already forged at the start); a "Congrats!" prompt appears and **Continue
Playing** dismisses it.
Type `/restart` in the game chat to reset the board to its starting position.
It works without manual mode and only in puzzle games; the game id and
connections are kept.

## Payload format

A scenario is compact JSON using the same vocabulary as `setupTest`
(see [`server/scenario/payload.js`](../server/scenario/payload.js)):

```json
{
    "version": 1,
    "title": "Example Puzzle",
    "author": "someone",
    "description": "Forge a key this turn.",
    "player1": {
        "house": "brobnar",
        "houses": ["brobnar", "untamed", "sanctum"],
        "amber": 4,
        "chains": 0,
        "keys": { "red": false },
        "token": "grumpus",
        "inPlay": [
            "bumpsy",
            {
                "card": "troll",
                "tokens": { "amber": 2 },
                "damage": 2,
                "exhausted": true,
                "upgrades": ["blood-of-titans"]
            }
        ],
        "hand": ["anger"],
        "deck": ["bumpsy"],
        "discard": [],
        "purged": [],
        "archives": []
    },
    "player2": { "inPlay": ["gub", { "card": "dew-faerie", "tokens": { "ward": 1 } }] },
    "goal": [
        { "type": "keys", "count": 1 },
        { "type": "card", "card": "gub", "location": "discard", "player": 2 }
    ],
    "actions": [{ "player": 2, "action": "clickPrompt", "args": ["untamed"] }]
}
```

-   Cards are referenced by id or exact name. `player1` is the creator.
-   `deck` lists the cards on top of the deck, in order; the remainder is filler.
    `discard` and `purged` list the top of the pile first.
-   `tokens` are absolute counts (they replace printed values such as armor).
-   `goal` is an optional list (or single object) of conditions that must all hold
    at once, checked whenever the game state changes. `player` is 1 (default, the
    creator) or 2. Without a goal, forging a key solves the puzzle.
    -   `{ "type": "keys", "count": n }`: the player has at least `n` forged keys.
    -   `{ "type": "amber", "min": n, "max": m }`: the player's amber is within the bounds.
    -   `{ "type": "card", "card": "troll", "location": "discard", "not": true }`: a
        card is (or with `not`, is not) in the player's `play area`, `hand`, `deck`,
        `discard`, `purged` or `archives`.
-   `actions` is an optional setup script restricted to an allow-list of
    `PlayerInteractionWrapper` methods (`clickPrompt`, `clickCard`, `moveCard`, ...).
-   Cards placed under other cards (e.g. Cauldron) and token creatures in
    play cannot be represented yet.

## Exporting an existing puzzle

```bash
npm run scenario:export -- path/to/foo.spec.js
npm run scenario:export -- 'path/to/foo.spec.js#test name' --standard
```

This runs the spec's `beforeEach` hooks (not the test body), snapshots the board
and prints the code (URL-safe base64 unless `--standard` is given). The title and
description are taken from the spec's `// Puzzle:` and `// Objective:` comments.
From code, use `exportSpec`, `scenarioFromGame` or `scenarioFromSetupOptions` in
[`server/scenario/export.js`](../server/scenario/export.js), then `encodeScenario`.
