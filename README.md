# Spill the Beans

A private, real-time multiplayer bean planting and trading card game for 3–8 friends in the browser.
The rules, card counts and payouts follow the classic bean-trading card game by Uwe Rosenberg; the name, bean names and artwork are original.

## Play locally

```bash
npm install
npm start          # http://localhost:3000
```

Other people on your Wi-Fi can join at `http://<your-computer's-IP>:3000`.

## Host it free on Render

1. Push this folder to a GitHub repository (private is fine).
2. Sign in at https://render.com with GitHub, choose **New → Blueprint**, and pick the repository.
   Render reads `render.yaml` and creates a free web service. (Or choose **New → Web Service**, runtime Node, build `npm install`, start `npm start`, instance type Free.)
3. When it's live you get a URL like `https://spill-the-beans-xxxx.onrender.com`. Share it with friends.

Free-tier notes: the server sleeps after about 15 minutes with no visitors, so the first visit can take up to a minute to wake up.
Games are kept in memory, so a redeploy or restart ends any game in progress.

## How a game works in the app

- One person clicks **Create a new room** and shares the link (or the 4-letter code). Everyone else joins with their name.
- The host can reorder seats, pick the ruleset, and press **Start**. A random player goes first.
- If someone's browser drops, they reopen the same link on the same device and pick up where they left off.

### Rules enforced

- Your hand order never changes: you plant from the front, new cards go to the back.
- Phase 1: you must plant your first card, and may plant the second.
- Phase 2: two cards are turned over. Only the active player trades, with anyone; others cannot trade with each other. Trades can use the turned-over cards and any cards from anywhere in a hand. Gifts (donations) must be accepted by the receiver. Cards received in a trade can't be traded again.
- Phase 3: everyone plants what they received; the active player also plants any turned-over cards they kept.
- Phase 4: draw (see rulesets).
- One bean type per field. Harvest any time, even on others' turns, except a lone bean while another field has 2+ (bean protection rule). Harvested coin cards leave the deck; the rest are discarded.
- When the draw pile runs out it is reshuffled from the discards. The game ends when it runs out for the 3rd time (2nd with 3 players). If that happens while turning over cards, the turn finishes trading and planting first. All fields are then harvested and the most coins wins.

### Rulesets (host picks in the lobby)

| | Classic English edition | AMIGO 25th anniversary |
|---|---|---|
| Starting fields | 2 (3 with 3 players) | 2 (3 with 3 players) |
| Buy a 3rd field | 3 coins (2 with 6+ players) | not allowed |
| Starting hand | 5 (6+ players: 3, 4, 5, then 6) | 5 |
| Phase 4 draw | active player draws 3 (4 with 6+ players) | every player draws 1, starting with the active player |
| Tie-break | most cards left in hand | seat furthest from the starting player |

Beans removed by player count (both rulesets): 3 players remove Truffle; 4–5 remove Mocha; 6–8 remove Truffle and Posy.
8 players is not covered by the official rules, so it uses the 6–7 player setup.

### Beans

| Bean | Cards | Cards needed for 1 / 2 / 3 / 4 coins |
|---|---|---|
| Mocha | 24 | 4 / 7 / 10 / 12 |
| Butter | 22 | 4 / 7 / 9 / 11 |
| Indigo | 20 | 4 / 6 / 8 / 10 |
| Ember | 18 | 3 / 6 / 8 / 9 |
| Skunk | 16 | 3 / 5 / 7 / 8 |
| Snap | 14 | 3 / 5 / 6 / 7 |
| Sunny | 12 | 2 / 4 / 6 / 7 |
| Owl-eye | 10 | 2 / 4 / 5 / 6 |
| Ruby | 8 | 2 / 3 / 4 / 5 |
| Posy | 6 | – / 2 / 3 / – |
| Truffle | 4 | – / 2 / 3 / 4 |

## Tests

```bash
npm test                                   # 300 simulated full games, 3–8 players, both rulesets
node test/bots.js ws://localhost:3000 8    # bots play a full game through a running server
```
