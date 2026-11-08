// Pure rules engine for the bean-trading game. No networking here.
const { BEANS, coinsFor } = require('./beans');

const RULESETS = {
  classic: 'Classic English edition (buy a 3rd field, active player draws 3)',
  amigo: 'AMIGO 25th-anniversary rules (everyone draws 1, no field buying)',
};

function rulesFor(ruleset, n) {
  const classic = ruleset !== 'amigo';
  const big = n >= 6;
  return {
    ruleset: classic ? 'classic' : 'amigo',
    removed: n === 3 ? ['truffle'] : n <= 5 ? ['mocha'] : ['truffle', 'posy'],
    startFields: n === 3 ? 3 : 2,
    canBuyField: classic && n !== 3,
    fieldCost: big ? 2 : 3,
    dealFor: (seatFromStart) => (classic && big ? [3, 4, 5][seatFromStart] ?? 6 : 5),
    drawMode: classic ? 'active' : 'each',
    drawCount: classic ? (big ? 4 : 3) : 1,
    runoutLimit: n === 3 ? 2 : 3,
    tiebreak: classic ? 'hand' : 'furthest',
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

class Game {
  constructor(players, opts = {}) {
    // players: [{id, name}] in clockwise seat order
    const n = players.length;
    if (n < 3 || n > 8) fail('This game needs 3 to 8 players.');
    this.rng = opts.rng || Math.random;
    this.rules = rulesFor(opts.ruleset, n);
    this.players = players.map((p) => ({
      id: p.id, name: p.name, hand: [], fields: Array.from({ length: this.rules.startFields }, () => []),
      coins: [], pending: [], boughtField: false,
    }));
    let id = 0;
    const deck = [];
    for (const [type, b] of Object.entries(BEANS)) {
      if (this.rules.removed.includes(type)) continue;
      for (let i = 0; i < b.count; i++) deck.push({ id: 'c' + (id++), t: type });
    }
    this.deck = shuffle(deck, this.rng);
    this.discard = [];
    this.faceup = [];
    this.offers = [];
    this.offerSeq = 1;
    this.runouts = 0;
    this.endTriggered = false;
    this.over = false;
    this.results = null;
    this.log = [];
    this.startIdx = opts.startIdx ?? Math.floor(this.rng() * n);
    this.active = this.startIdx;
    this.turn = 1;
    for (let s = 0; s < n; s++) {
      const p = this.players[(this.startIdx + s) % n];
      const k = this.rules.dealFor(s);
      for (let i = 0; i < k; i++) p.hand.push(this.deck.pop());
    }
    this.phase = 'plant'; // plant -> trade -> plantPending -> (draw) -> next player
    this.plantedThisTurn = 0;
    this.addLog(`Game started. ${this.players[this.active].name} goes first.`);
  }

  addLog(text) {
    this.log.push({ t: Date.now(), text });
    if (this.log.length > 300) this.log.shift();
  }

  p(id) { const pl = this.players.find((x) => x.id === id); if (!pl) fail('Unknown player.'); return pl; }
  get activePlayer() { return this.players[this.active]; }
  isActive(id) { return this.activePlayer.id === id; }

  // ---- deck ----
  drawOne() {
    if (this.endTriggered) return null;
    if (this.deck.length === 0) {
      this.onRunout();
      if (this.endTriggered || this.deck.length === 0) return null;
    }
    const c = this.deck.pop();
    if (this.deck.length === 0) this.onRunout();
    return c;
  }

  onRunout() {
    this.runouts++;
    if (this.runouts >= this.rules.runoutLimit) {
      this.endTriggered = true;
      this.addLog(`The draw pile ran out for the ${ordinal(this.runouts)} time. The game ends after this.`);
    } else {
      this.deck = shuffle(this.discard, this.rng);
      this.discard = [];
      this.addLog(`The draw pile ran out (${ordinal(this.runouts)} time). Discards reshuffled into a new pile of ${this.deck.length}.`);
    }
  }

  // ---- helpers ----
  canPlantIn(pl, fieldIdx, type) {
    const f = pl.fields[fieldIdx];
    if (!f) fail('No such field.');
    return f.length === 0 || f[0].t === type;
  }

  plantCard(pl, card, fieldIdx) {
    if (!this.canPlantIn(pl, fieldIdx, card.t)) fail('That field holds a different bean. Harvest it first or pick another field.');
    pl.fields[fieldIdx].push(card);
  }

  assertNotOver() { if (this.over) fail('The game is over.'); }

  // ---- actions ----
  act(playerId, a) {
    this.assertNotOver();
    switch (a.type) {
      case 'plantHand': return this.plantHand(playerId, a.field);
      case 'endPlanting': return this.endPlanting(playerId);
      case 'offer': return this.createOffer(playerId, a);
      case 'cancelOffer': return this.cancelOffer(playerId, a.offerId);
      case 'declineOffer': return this.declineOffer(playerId, a.offerId);
      case 'acceptOffer': return this.acceptOffer(playerId, a.offerId, a.cards || []);
      case 'keepFaceup': return this.keepFaceup(playerId, a.cardId);
      case 'endTrading': return this.endTrading(playerId);
      case 'plantPending': return this.plantPending(playerId, a.cardId, a.field);
      case 'harvest': return this.harvest(playerId, a.field);
      case 'buyField': return this.buyField(playerId);
      default: fail('Unknown action.');
    }
  }

  plantHand(id, field) {
    if (!this.isActive(id)) fail('It is not your turn.');
    if (this.phase !== 'plant') fail('You can only plant from your hand at the start of your turn.');
    const pl = this.p(id);
    if (pl.hand.length === 0) fail('Your hand is empty.');
    if (this.plantedThisTurn >= 2) fail('You may plant at most two cards from your hand.');
    const card = pl.hand[0];
    this.plantCard(pl, card, field);
    pl.hand.shift();
    this.plantedThisTurn++;
    this.addLog(`${pl.name} planted a ${BEANS[card.t].name} from their hand.`);
    if (this.plantedThisTurn >= 2 || pl.hand.length === 0) this.endPlanting(id);
  }

  endPlanting(id) {
    if (!this.isActive(id)) fail('It is not your turn.');
    if (this.phase !== 'plant') fail('Planting is already done.');
    const pl = this.p(id);
    if (this.plantedThisTurn === 0 && pl.hand.length > 0) fail('You must plant the first card in your hand.');
    this.phase = 'trade';
    for (let i = 0; i < 2; i++) {
      const c = this.drawOne();
      if (c) this.faceup.push(c);
    }
    this.addLog(`${pl.name} turned over ${this.faceup.map((c) => BEANS[c.t].name).join(' and ') || 'nothing'}.`);
  }

  // Offer: give = [cardId] from offerer hand (or face-up if offerer is active);
  // wantFaceup = [cardId] (only when offerer is not active); wantTypes = {type: count} from the other side's hand.
  createOffer(id, a) {
    if (this.phase !== 'trade') fail('Trading happens after the active player turns over two cards.');
    const from = this.p(id);
    const activeId = this.activePlayer.id;
    let to = a.to || null;
    if (id !== activeId) {
      if (to && to !== activeId) fail('You can only trade with the active player.');
      to = activeId;
    } else if (to === activeId) fail('You cannot trade with yourself.');
    if (to) this.p(to);
    const give = [...new Set(a.give || [])];
    for (const cid of give) {
      const inHand = from.hand.some((c) => c.id === cid);
      const inFace = id === activeId && this.faceup.some((c) => c.id === cid);
      if (!inHand && !inFace) fail('You can only offer cards from your hand' + (id === activeId ? ' or the turned-over cards.' : '.'));
    }
    const wantFaceup = id === activeId ? [] : [...new Set(a.wantFaceup || [])];
    for (const cid of wantFaceup) if (!this.faceup.some((c) => c.id === cid)) fail('That turned-over card is gone.');
    const wantTypes = {};
    for (const [t, k] of Object.entries(a.wantTypes || {})) {
      const n = Math.floor(Number(k));
      if (!BEANS[t] || this.rules.removed.includes(t)) fail('Unknown bean.');
      if (n > 0 && n <= 30) wantTypes[t] = n;
    }
    if (give.length === 0 && wantFaceup.length === 0 && Object.keys(wantTypes).length === 0) fail('An offer needs something in it.');
    const offer = { id: 'o' + (this.offerSeq++), from: id, to, give, wantFaceup, wantTypes, declinedBy: [] };
    this.offers.push(offer);
    this.addLog(`${from.name} offered ${this.describeOffer(offer)}${to ? ' to ' + this.p(to).name : ' to anyone'}.`);
    return offer.id;
  }

  describeOffer(o) {
    const cardName = (cid) => { const c = this.findCard(cid); return c ? BEANS[c.t].name : '?'; };
    const g = o.give.map(cardName);
    const w = [...o.wantFaceup.map((cid) => cardName(cid) + ' (turned over)'),
      ...Object.entries(o.wantTypes).map(([t, n]) => `${n}× ${BEANS[t].name}`)];
    if (w.length === 0) return `a gift of ${g.join(', ')}`;
    if (g.length === 0) return `a request for ${w.join(', ')} (as a gift)`;
    return `${g.join(', ')} for ${w.join(', ')}`;
  }

  findCard(cid) {
    for (const pl of this.players) for (const c of pl.hand) if (c.id === cid) return c;
    for (const c of this.faceup) if (c.id === cid) return c;
    return null;
  }

  cancelOffer(id, offerId) {
    const i = this.offers.findIndex((o) => o.id === offerId && o.from === id);
    if (i < 0) fail('Offer not found.');
    this.offers.splice(i, 1);
  }

  declineOffer(id, offerId) {
    const o = this.offers.find((x) => x.id === offerId);
    if (!o) fail('Offer not found.');
    if (o.to === id) { this.offers.splice(this.offers.indexOf(o), 1); this.addLog(`${this.p(id).name} declined ${this.p(o.from).name}'s offer.`); return; }
    if (!o.declinedBy.includes(id)) o.declinedBy.push(id);
  }

  offerStillValid(o) {
    const from = this.p(o.from);
    const isAct = o.from === this.activePlayer.id;
    for (const cid of o.give) {
      if (!from.hand.some((c) => c.id === cid) && !(isAct && this.faceup.some((c) => c.id === cid))) return false;
    }
    for (const cid of o.wantFaceup) if (!this.faceup.some((c) => c.id === cid)) return false;
    return true;
  }

  acceptOffer(id, offerId, cardIds) {
    if (this.phase !== 'trade') fail('Trading is over.');
    const o = this.offers.find((x) => x.id === offerId);
    if (!o) fail('That offer is no longer available.');
    if (o.from === id) fail('You cannot accept your own offer.');
    if (o.to && o.to !== id) fail('That offer is for someone else.');
    if (!o.to && o.from !== this.activePlayer.id) fail('Offer not open.');
    if (!this.offerStillValid(o)) { this.offers.splice(this.offers.indexOf(o), 1); fail('Those cards are no longer available.'); }
    const from = this.p(o.from);
    const me = this.p(id);
    // Validate the accepter's chosen hand cards match wantTypes exactly.
    const chosen = [...new Set(cardIds)];
    const need = { ...o.wantTypes };
    for (const cid of chosen) {
      const c = me.hand.find((x) => x.id === cid);
      if (!c) fail('You can only give cards from your hand.');
      if (!need[c.t]) fail(`The offer does not ask for a ${BEANS[c.t].name}.`);
      need[c.t]--;
    }
    if (Object.values(need).some((v) => v > 0)) fail('Pick exactly the cards the offer asks for.');
    // Transfer
    const take = (pl, cid) => {
      let i = pl.hand.findIndex((c) => c.id === cid);
      if (i >= 0) return pl.hand.splice(i, 1)[0];
      i = this.faceup.findIndex((c) => c.id === cid);
      return this.faceup.splice(i, 1)[0];
    };
    for (const cid of o.give) me.pending.push(take(from, cid));
    for (const cid of o.wantFaceup) from.pending.push(take(this.activePlayer, cid));
    for (const cid of chosen) from.pending.push(take(me, cid));
    this.addLog(`${me.name} accepted ${from.name}'s offer: ${o.give.length ? o.give.length + ' card(s) to ' + me.name : ''}${o.give.length && (chosen.length + o.wantFaceup.length) ? ', ' : ''}${chosen.length + o.wantFaceup.length ? (chosen.length + o.wantFaceup.length) + ' card(s) to ' + from.name : ''}.`);
    this.offers.splice(this.offers.indexOf(o), 1);
    this.offers = this.offers.filter((x) => this.offerStillValid(x));
  }

  keepFaceup(id, cardId) {
    // Active player sets a turned-over card aside to plant (it can no longer be traded).
    if (!this.isActive(id)) fail('Only the active player can keep turned-over cards.');
    if (this.phase !== 'trade') fail('Not now.');
    const i = this.faceup.findIndex((c) => c.id === cardId);
    if (i < 0) fail('That card is gone.');
    this.activePlayer.pending.push(this.faceup.splice(i, 1)[0]);
    this.offers = this.offers.filter((x) => this.offerStillValid(x));
  }

  endTrading(id) {
    if (!this.isActive(id)) fail('Only the active player can end trading.');
    if (this.phase !== 'trade') fail('Not in the trading phase.');
    const pl = this.activePlayer;
    pl.pending.push(...this.faceup);
    this.faceup = [];
    this.offers = [];
    this.phase = 'plantPending';
    this.addLog(`${pl.name} ended trading. Everyone plants the beans they received.`);
    this.maybeFinishPlanting();
  }

  plantPending(id, cardId, field) {
    if (this.phase !== 'plantPending' && this.phase !== 'trade') fail('Nothing to plant right now.');
    if (this.phase === 'trade') fail('Traded and turned-over beans are planted once trading ends.');
    const pl = this.p(id);
    const i = pl.pending.findIndex((c) => c.id === cardId);
    if (i < 0) fail('That card is not waiting to be planted.');
    this.plantCard(pl, pl.pending[i], field);
    const [c] = pl.pending.splice(i, 1);
    this.addLog(`${pl.name} planted a ${BEANS[c.t].name}.`);
    this.maybeFinishPlanting();
  }

  maybeFinishPlanting() {
    if (this.phase !== 'plantPending') return;
    if (this.players.some((x) => x.pending.length > 0)) return;
    if (this.endTriggered) return this.finish();
    this.drawPhase();
  }

  drawPhase() {
    const n = this.players.length;
    const pl = this.activePlayer;
    if (this.rules.drawMode === 'active') {
      let got = 0;
      for (let i = 0; i < this.rules.drawCount; i++) {
        const c = this.drawOne();
        if (c) { pl.hand.push(c); got++; }
        if (this.endTriggered) break;
      }
      this.addLog(`${pl.name} drew ${got} card(s).`);
    } else {
      for (let s = 0; s < n; s++) {
        const q = this.players[(this.active + s) % n];
        const c = this.drawOne();
        if (c) q.hand.push(c);
        if (this.endTriggered) break;
      }
      this.addLog('Everyone drew a card.');
    }
    if (this.endTriggered) return this.finish();
    this.active = (this.active + 1) % n;
    this.turn++;
    this.phase = 'plant';
    this.plantedThisTurn = 0;
    this.addLog(`It is ${this.activePlayer.name}'s turn.`);
  }

  harvest(id, field) {
    const pl = this.p(id);
    const f = pl.fields[field];
    if (!f) fail('No such field.');
    if (f.length === 0) fail('That field is empty.');
    if (f.length === 1 && pl.fields.some((g) => g.length > 1)) fail('Bean protection rule: you cannot harvest a single bean while another field has more than one.');
    this.doHarvest(pl, field);
  }

  doHarvest(pl, field) {
    const f = pl.fields[field];
    const type = f[0].t;
    const coins = coinsFor(type, f.length);
    const cards = f.splice(0);
    pl.coins.push(...cards.slice(0, coins));
    this.discard.push(...cards.slice(coins));
    this.addLog(`${pl.name} harvested ${cards.length} ${BEANS[type].name}${cards.length > 1 ? 's' : ''} for ${coins} coin${coins === 1 ? '' : 's'}.`);
    return coins;
  }

  buyField(id) {
    if (!this.rules.canBuyField) fail('Buying a third field is not part of these rules.');
    const pl = this.p(id);
    if (pl.boughtField || pl.fields.length >= 3) fail('You already have a third field.');
    const cost = this.rules.fieldCost;
    if (pl.coins.length < cost) fail(`A third field costs ${cost} coins.`);
    this.discard.push(...pl.coins.splice(pl.coins.length - cost, cost));
    pl.fields.push([]);
    pl.boughtField = true;
    this.addLog(`${pl.name} bought a third bean field for ${cost} coins.`);
  }

  finish() {
    for (const pl of this.players) for (let i = 0; i < pl.fields.length; i++) if (pl.fields[i].length) this.doHarvest(pl, i);
    const n = this.players.length;
    const ranked = this.players.map((pl, idx) => ({
      id: pl.id, name: pl.name, coins: pl.coins.length, hand: pl.hand.length, dist: (idx - this.startIdx + n) % n,
    }));
    const tb = this.rules.tiebreak;
    ranked.sort((a, b) => b.coins - a.coins || (tb === 'hand' ? b.hand - a.hand : b.dist - a.dist));
    this.results = ranked;
    this.over = true;
    this.phase = 'over';
    this.faceup = [];
    this.offers = [];
    this.addLog(`Game over! ${ranked[0].name} wins with ${ranked[0].coins} coins.`);
  }

  // State visible to one player.
  view(viewerId) {
    return {
      rules: { ...this.rules, dealFor: undefined, rulesetLabel: RULESETS[this.rules.ruleset] },
      phase: this.phase,
      turn: this.turn,
      active: this.activePlayer.id,
      startPlayer: this.players[this.startIdx].id,
      plantedThisTurn: this.plantedThisTurn,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      discardTop: this.discard.length ? this.discard[this.discard.length - 1] : null,
      runouts: this.runouts,
      endTriggered: this.endTriggered,
      faceup: this.faceup,
      offers: this.offers,
      results: this.results,
      log: this.log.slice(-80),
      players: this.players.map((pl) => ({
        id: pl.id, name: pl.name,
        handCount: pl.hand.length,
        hand: pl.id === viewerId || this.over ? pl.hand : undefined,
        fields: pl.fields,
        coins: pl.coins.length,
        pending: pl.pending,
        boughtField: pl.boughtField,
      })),
    };
  }
}

function ordinal(n) { return ['zeroth', 'first', 'second', 'third', 'fourth'][n] || n + 'th'; }

module.exports = { Game, GameError, rulesFor, RULESETS };
