// Plays many full random games through the engine and checks invariants.
const assert = require('assert');
const { Game, GameError } = require('../src/game');
const { BEANS, coinsFor } = require('../src/beans');

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function total(g) {
  let n = g.deck.length + g.discard.length + g.faceup.length;
  for (const p of g.players) n += p.hand.length + p.coins.length + p.pending.length + p.fields.reduce((a, f) => a + f.length, 0);
  return n;
}

function fieldFor(g, p, type) {
  let i = p.fields.findIndex((f) => f.length && f[0].t === type);
  if (i < 0) i = p.fields.findIndex((f) => f.length === 0);
  return i;
}

function makeRoom(g, p, rng) {
  const multi = p.fields.some((f) => f.length > 1);
  const legal = p.fields.map((f, i) => i).filter((i) => p.fields[i].length && (!multi || p.fields[i].length > 1));
  const i = legal[Math.floor(rng() * legal.length)];
  g.act(p.id, { type: 'harvest', field: i });
}

function plant(g, p, type, doIt, rng) {
  let i = fieldFor(g, p, type);
  if (i < 0) { makeRoom(g, p, rng); i = fieldFor(g, p, type); }
  doIt(i);
}

function play(n, ruleset, seed) {
  const rng = mulberry(seed);
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const g = new Game(players, { ruleset, rng });
  const T = total(g);
  const expected = Object.entries(BEANS).filter(([t]) => !g.rules.removed.includes(t)).reduce((a, [, b]) => a + b.count, 0);
  assert.strictEqual(T, expected);
  let steps = 0, trades = 0;
  while (!g.over) {
    if (++steps > 20000) throw new Error('stuck');
    const act = g.activePlayer;
    if (g.phase === 'plant') {
      if (act.hand.length === 0) { g.act(act.id, { type: 'endPlanting' }); continue; }
      plant(g, act, act.hand[0].t, (i) => g.act(act.id, { type: 'plantHand', field: i }), rng);
      if (g.phase === 'plant' && rng() < 0.5) g.act(act.id, { type: 'endPlanting' });
    } else if (g.phase === 'trade') {
      // some random trades
      for (let k = 0; k < 3; k++) {
        const other = g.players[(g.active + 1 + Math.floor(rng() * (n - 1))) % n];
        if (rng() < 0.5 && g.faceup.length && other.hand.length) {
          const want = other.hand[Math.floor(rng() * other.hand.length)].t;
          const oid = g.act(act.id, { type: 'offer', to: other.id, give: [g.faceup[0].id], wantTypes: { [want]: 1 } });
          const pick = other.hand.find((c) => c.t === want);
          g.act(other.id, { type: 'acceptOffer', offerId: oid, cards: [pick.id] });
          trades++;
        } else if (rng() < 0.3 && other.hand.length) {
          const oid = g.act(other.id, { type: 'offer', give: [other.hand[other.hand.length - 1].id] }); // donation to active
          g.act(act.id, { type: 'acceptOffer', offerId: oid, cards: [] });
          trades++;
        }
      }
      // Rule checks: can't trade with non-active, can't offer pending cards
      const a = g.players[(g.active + 1) % n], b = g.players[(g.active + 2) % n];
      assert.throws(() => g.act(a.id, { type: 'offer', to: b.id, give: [] , wantTypes: { [Object.keys(BEANS).find(t=>!g.rules.removed.includes(t))]: 1 } }), GameError);
      if (act.pending.length) assert.throws(() => g.act(act.id, { type: 'offer', give: [act.pending[0].id] }), GameError);
      g.act(act.id, { type: 'endTrading' });
    } else if (g.phase === 'plantPending') {
      for (const p of g.players) {
        while (p.pending.length && g.phase === 'plantPending') {
          const c = p.pending[0];
          plant(g, p, c.t, (i) => g.act(p.id, { type: 'plantPending', cardId: c.id, field: i }), rng);
        }
      }
    }
    // random extra harvest / buy
    if (!g.over && rng() < 0.05) {
      const p = g.players[Math.floor(rng() * n)];
      if (p.coins.length >= g.rules.fieldCost && g.rules.canBuyField && !p.boughtField) g.act(p.id, { type: 'buyField' });
    }
    assert.strictEqual(total(g), T, 'card conservation');
    for (const p of g.players) for (const f of p.fields) assert(f.every((c) => c.t === f[0].t), 'one type per field');
  }
  assert.strictEqual(g.runouts, g.rules.runoutLimit);
  assert(g.players.every((p) => p.fields.every((f) => f.length === 0)));
  return { turns: g.turn, trades, winner: g.results[0] };
}

// Unit checks
assert.strictEqual(coinsFor('skunk', 2), 0);
assert.strictEqual(coinsFor('skunk', 3), 1);
assert.strictEqual(coinsFor('skunk', 8), 4);
assert.strictEqual(coinsFor('skunk', 12), 4);
assert.strictEqual(coinsFor('posy', 1), 0);
assert.strictEqual(coinsFor('posy', 2), 2);
assert.strictEqual(coinsFor('posy', 3), 3);
assert.strictEqual(coinsFor('truffle', 4), 4);
assert.strictEqual(coinsFor('mocha', 9), 2);

{ // protection rule + must plant first + deal sizes
  const g = new Game([1, 2, 3, 4, 5, 6].map((i) => ({ id: 'p' + i, name: 'P' + i })), { startIdx: 0, rng: mulberry(1) });
  assert.deepStrictEqual(g.players.map((p) => p.hand.length), [3, 4, 5, 6, 6, 6]);
  assert.strictEqual(g.rules.drawCount, 4); assert.strictEqual(g.rules.fieldCost, 2);
  assert.throws(() => g.act('p1', { type: 'endPlanting' }), /must plant/);
  assert.throws(() => g.act('p2', { type: 'plantHand', field: 0 }), /not your turn/);
  const p = g.players[0];
  p.fields[0] = [{ id: 'x1', t: 'ruby' }]; p.fields[1] = [{ id: 'x2', t: 'snap' }, { id: 'x3', t: 'snap' }];
  assert.throws(() => g.act('p1', { type: 'harvest', field: 0 }), /protection/);
  g.players[0].fields = [[], []];
}
{ const g = new Game([1, 2, 3, 4].map((i) => ({ id: 'p' + i, name: 'P' + i })), { ruleset: 'amigo', rng: mulberry(2) });
  assert.throws(() => g.act('p1', { type: 'buyField' }), /not part/);
  assert(g.rules.removed.includes('mocha')); }

let games = 0;
for (const ruleset of ['classic', 'amigo']) for (let n = 3; n <= 8; n++) for (let s = 1; s <= 25; s++) {
  const r = play(n, ruleset, s * 97 + n);
  games++;
  if (s === 1) console.log(`${ruleset} ${n}p: ${r.turns} turns, ${r.trades} trades, winner ${r.winner.name} with ${r.winner.coins}`);
}
console.log(`OK: ${games} full simulated games passed all rule checks.`);
