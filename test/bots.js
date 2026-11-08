// Plays complete games over WebSockets against a running server: node test/bots.js [url] [players]
const WebSocket = require('ws');
const URL = process.argv[2] || 'ws://localhost:3000';
const N = +(process.argv[3] || 5);
const KEEP = process.argv[4] === 'keep'; // leave first seat free for a human watcher
function client(name) {
  const ws = new WebSocket(URL); const c = { ws, name, state: null, id: null, code: null, errors: 0 };
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'joined') { c.id = m.id; c.code = m.code; } if (m.t === 'state') { c.state = m.room; c.onstate && c.onstate(); } if (m.t === 'error') { c.errors++; c.lastErr = m.msg; } });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.ready = new Promise((r) => ws.on('open', r));
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const bots = [];
  const host = client('Bot1'); await host.ready; host.send({ t: 'create', name: 'Bot1' });
  while (!host.code) await sleep(20);
  bots.push(host);
  for (let i = 2; i <= N; i++) { const b = client('Bot' + i); await b.ready; b.send({ t: 'join', code: host.code, name: 'Bot' + i }); bots.push(b); }
  await sleep(200);
  host.send({ t: 'start' });
  await sleep(200);
  let ticks = 0;
  while (!(host.state.game.phase === 'over') && ticks++ < 20000) {
    for (const b of bots) {
      const g = b.state.game; const me = g.players.find((p) => p.id === b.id);
      const fieldFor = (t) => { let i = me.fields.findIndex((f) => f.length && f[0].t === t); if (i < 0) i = me.fields.findIndex((f) => !f.length); return i; };
      const room = () => { const multi = me.fields.some((f) => f.length > 1); const i = me.fields.findIndex((f) => f.length && (!multi || f.length > 1)); b.send({ t: 'act', a: { type: 'harvest', field: i } }); };
      if (g.phase === 'plant' && g.active === b.id) {
        if (!me.hand.length) b.send({ t: 'act', a: { type: 'endPlanting' } });
        else { const i = fieldFor(me.hand[0].t); if (i < 0) room(); else b.send({ t: 'act', a: { type: 'plantHand', field: i } }); }
      } else if (g.phase === 'trade' && g.active === b.id) {
        b.send({ t: 'act', a: { type: 'endTrading' } });
      } else if (g.phase === 'plantPending' && me.pending.length) {
        const c = me.pending[0]; const i = fieldFor(c.t); if (i < 0) room(); else b.send({ t: 'act', a: { type: 'plantPending', cardId: c.id, field: i } });
      }
      if (me.coins >= g.rules.fieldCost && g.rules.canBuyField && !me.boughtField && g.phase !== 'over') b.send({ t: 'act', a: { type: 'buyField' } });
    }
    await sleep(15);
  }
  const g = host.state.game;
  console.log('room', host.code, 'over:', g.phase === 'over', 'turns:', g.turn, 'results:', g.results && g.results.map((r) => `${r.name}:${r.coins}`).join(' '));
  if (!KEEP) bots.forEach((b) => b.ws.close()); else console.log('keeping connections');
  if (g.phase !== 'over') process.exit(1);
  if (!KEEP) process.exit(0);
})();
