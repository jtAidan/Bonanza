// HTTP + WebSocket server: serves the client and runs game rooms in memory.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, GameError } = require('./game');
const { BEANS } = require('./beans');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_PLAYERS = 8;
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS || 3);
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url.pathname === '/beans.json') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(BEANS)); }
  let file = url.pathname === '/' || url.pathname.startsWith('/r/') ? '/index.html' : url.pathname;
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map(); // code -> room

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join(''); } while (rooms.has(code));
  return code;
}

function cleanName(s) { return String(s || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16) || 'Farmer'; }

function roomView(room, member) {
  return {
    code: room.code,
    hostId: room.hostId,
    you: member.id,
    started: !!room.game,
    options: room.options,
    members: room.members.map((m) => ({ id: m.id, name: m.name, online: m.sockets.size > 0 })),
    chat: room.chat.slice(-60),
    game: room.game ? room.game.view(member.id) : null,
  };
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function broadcast(room) {
  room.touched = Date.now();
  for (const m of room.members) {
    const view = roomView(room, m);
    for (const ws of m.sockets) send(ws, { t: 'state', room: view });
  }
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null;
  let member = null;

  const attach = (r, m) => {
    room = r; member = m;
    m.sockets.add(ws);
    send(ws, { t: 'joined', code: r.code, token: m.token, id: m.id });
    broadcast(r);
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try {
      if (msg.t === 'create') {
        const code = newCode();
        const m = { id: crypto.randomUUID(), token: crypto.randomUUID(), name: cleanName(msg.name), sockets: new Set() };
        const r = { code, hostId: m.id, members: [m], game: null, chat: [], options: { ruleset: 'classic' }, touched: Date.now() };
        rooms.set(code, r);
        return attach(r, m);
      }
      if (msg.t === 'join') {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return send(ws, { t: 'error', msg: 'No room with that code. Check the code or create a new room.' , fatal: true });
        const existing = msg.token && r.members.find((m) => m.token === msg.token);
        if (existing) return attach(r, existing);
        if (r.game) return send(ws, { t: 'error', msg: 'That game has already started.', fatal: true });
        if (r.members.length >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'That room is full (8 players).', fatal: true });
        let name = cleanName(msg.name);
        while (r.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) name = name.slice(0, 14) + Math.floor(Math.random() * 10);
        const m = { id: crypto.randomUUID(), token: crypto.randomUUID(), name, sockets: new Set() };
        r.members.push(m);
        return attach(r, m);
      }
      if (!room || !member) return send(ws, { t: 'error', msg: 'Join a room first.' });
      if (msg.t === 'chat') {
        const text = String(msg.text || '').slice(0, 300).trim();
        if (text) room.chat.push({ from: member.name, text, at: Date.now() });
        if (room.chat.length > 200) room.chat.shift();
        return broadcast(room);
      }
      if (msg.t === 'options') {
        if (member.id !== room.hostId || room.game) return;
        if (['classic', 'amigo'].includes(msg.options?.ruleset)) room.options.ruleset = msg.options.ruleset;
        return broadcast(room);
      }
      if (msg.t === 'seat') {
        // host reorders seating: msg.order = [memberIds]
        if (member.id !== room.hostId || room.game) return;
        const order = msg.order || [];
        if (order.length === room.members.length && order.every((id) => room.members.some((m) => m.id === id))) {
          room.members = order.map((id) => room.members.find((m) => m.id === id));
        }
        return broadcast(room);
      }
      if (msg.t === 'kick') {
        if (member.id !== room.hostId || room.game) return;
        const k = room.members.find((m) => m.id === msg.id && m.id !== room.hostId);
        if (k) { room.members = room.members.filter((m) => m !== k); for (const s of k.sockets) send(s, { t: 'error', msg: 'You were removed from the room.', fatal: true }); }
        return broadcast(room);
      }
      if (msg.t === 'leave') {
        member.sockets.delete(ws);
        if (!room.game) {
          room.members = room.members.filter((m) => m !== member);
          if (room.members.length === 0) rooms.delete(room.code);
          else if (room.hostId === member.id) room.hostId = room.members[0].id;
          broadcast(room);
        }
        room = null; member = null;
        return;
      }
      if (msg.t === 'start') {
        if (member.id !== room.hostId) return send(ws, { t: 'error', msg: 'Only the host can start.' });
        if (room.game && !room.game.over) return;
        if (room.members.length < MIN_PLAYERS) return send(ws, { t: 'error', msg: `You need at least ${MIN_PLAYERS} players (4–8 recommended).` });
        room.game = new Game(room.members.map((m) => ({ id: m.id, name: m.name })), { ruleset: room.options.ruleset });
        return broadcast(room);
      }
      if (msg.t === 'act') {
        if (!room.game) return send(ws, { t: 'error', msg: 'The game has not started.' });
        room.game.act(member.id, msg.a || {});
        return broadcast(room);
      }
    } catch (e) {
      if (e instanceof GameError) return send(ws, { t: 'error', msg: e.message });
      console.error(e);
      send(ws, { t: 'error', msg: 'Something went wrong on the server.' });
    }
  });

  ws.on('close', () => {
    if (member) { member.sockets.delete(ws); if (room && rooms.has(room.code)) broadcast(room); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > ROOM_IDLE_MS) rooms.delete(code);
}, 30000).unref();

server.listen(PORT, () => console.log(`Spill the Beans listening on http://localhost:${PORT}`));
