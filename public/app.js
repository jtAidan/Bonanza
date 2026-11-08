/* Spill the Beans client */
(() => {
  const $app = document.getElementById('app');
  const $side = document.getElementById('side');
  const $sideBody = document.getElementById('side-body');
  const $toast = document.getElementById('toast');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let ws = null, room = null, retry = 0, wantConnect = false;
  let session = load();
  const ui = { give: new Set(), wantFace: new Set(), wantTypes: {}, to: '', selPending: null, accepting: null, acceptSel: new Set(), tab: 'log', showRules: false, lastLogLen: 0 };

  function load() { try { return JSON.parse(localStorage.getItem('bb-session') || 'null'); } catch { return null; } }
  function save() { try { localStorage.setItem('bb-session', JSON.stringify(session)); } catch {} }
  function savedName() { try { return localStorage.getItem('bb-name') || ''; } catch { return ''; } }

  function toast(msg, ms = 3200) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, ms);
  }

  // ---------- networking ----------
  function connect(first) {
    wantConnect = true;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => { retry = 0; if (first) ws.send(JSON.stringify(first)); else if (session) ws.send(JSON.stringify({ t: 'join', code: session.code, token: session.token, name: session.name })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'joined') {
        session = { code: m.code, token: m.token, name: session?.name || savedName() };
        save();
        if (location.pathname !== '/r/' + m.code) history.replaceState(null, '', '/r/' + m.code);
      } else if (m.t === 'state') {
        const prev = room; room = m.room; onState(prev); render();
      } else if (m.t === 'error') {
        toast(m.msg);
        if (m.fatal) { session = null; save(); room = null; wantConnect = false; ws.close(); history.replaceState(null, '', '/'); render(); }
      }
    };
    ws.onclose = () => {
      if (!wantConnect) return;
      const d = Math.min(8000, 500 * 2 ** retry++);
      setTimeout(() => { if (wantConnect) connect(); }, d);
      if (room) document.body.classList.add('offline');
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else toast('Reconnecting…'); }
  function act(a) { send({ t: 'act', a }); }

  function onState(prev) {
    document.body.classList.remove('offline');
    const g = room.game;
    if (!g) return;
    // Clear selections that no longer make sense
    const me = g.players.find((p) => p.id === room.you);
    if (g.phase !== 'trade') { ui.give.clear(); ui.wantFace.clear(); ui.wantTypes = {}; ui.accepting = null; ui.acceptSel.clear(); }
    if (me) {
      const ids = new Set([...(me.hand || []).map((c) => c.id), ...g.faceup.map((c) => c.id)]);
      for (const id of [...ui.give]) if (!ids.has(id)) ui.give.delete(id);
      if (ui.selPending && !me.pending.some((c) => c.id === ui.selPending)) ui.selPending = null;
      if (!ui.selPending && me.pending.length) ui.selPending = me.pending[0].id;
    }
    if (ui.accepting && !g.offers.some((o) => o.id === ui.accepting)) { ui.accepting = null; ui.acceptSel.clear(); }
    const pg = prev?.game;
    if (pg && g.phase !== 'over' && pg.active !== g.active && g.active === room.you) toast("It's your turn! Plant the first card in your hand.");
    if (pg && g.offers.some((o) => o.to === room.you && !pg.offers.some((x) => x.id === o.id))) toast('You have a new trade offer.');
  }

  // ---------- render ----------
  function render() {
    document.body.classList.toggle('has-side', !!room);
    if (!room) { $side.hidden = true; return renderHome(); }
    $side.hidden = false;
    if (!room.game) renderLobby(); else renderGame();
    renderSide();
  }

  function renderHome() {
    const path = location.pathname.match(/^\/r\/([A-Za-z]{4})/);
    const code = path ? path[1].toUpperCase() : '';
    $app.innerHTML = `
      <div class="home">
        <div class="brand">${beanSVG('snap', 72)}<h1>Spill the Beans</h1><p>Plant, trade and harvest beans with 3–8 friends.</p></div>
        <div class="panel">
          <label>Your name<input id="name" maxlength="16" value="${esc(savedName())}" placeholder="e.g. Sam"></label>
          <div class="row">
            <input id="code" maxlength="4" placeholder="ROOM" value="${esc(code)}" style="text-transform:uppercase;width:7em">
            <button class="primary" data-action="join">Join room</button>
          </div>
          <div class="or">or</div>
          <button data-action="create" class="${code ? '' : 'primary'}">Create a new room</button>
        </div>
        <button class="link" data-action="rules-home">How to play</button>
        ${ui.showRules ? `<div class="panel rules">${rulesHTML()}</div>` : ''}
      </div>`;
  }

  function renderLobby() {
    const isHost = room.hostId === room.you;
    const link = `${location.origin}/r/${room.code}`;
    $app.innerHTML = `
      <div class="lobby">
        <div class="panel">
          <h2>Room <span class="code">${room.code}</span></h2>
          <p>Send friends this link: <a href="${link}">${esc(link)}</a> <button class="small" data-action="copy" data-text="${esc(link)}">Copy</button></p>
          <h3>Players (${room.members.length}/8) <small>seating order, clockwise</small></h3>
          <ol class="members">${room.members.map((m, i) => `<li>
            <span class="dot ${m.online ? 'on' : ''}"></span> ${esc(m.name)} ${m.id === room.hostId ? '<em>host</em>' : ''} ${m.id === room.you ? '<em>you</em>' : ''}
            ${isHost ? `<span class="seat-btns"><button class="small" data-action="seat" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="small" data-action="seat" data-i="${i}" data-d="1" ${i === room.members.length - 1 ? 'disabled' : ''}>↓</button>${m.id !== room.hostId ? `<button class="small" data-action="kick" data-id="${m.id}">Remove</button>` : ''}</span>` : ''}
          </li>`).join('')}</ol>
          <h3>Rules</h3>
          <label class="radio"><input type="radio" name="ruleset" value="classic" ${room.options.ruleset === 'classic' ? 'checked' : ''} ${isHost ? '' : 'disabled'}> <b>Classic English edition</b>: buy a 3rd field (3 coins, or 2 with 6+ players); the active player draws 3 cards (4 with 6+ players).</label>
          <label class="radio"><input type="radio" name="ruleset" value="amigo" ${room.options.ruleset === 'amigo' ? 'checked' : ''} ${isHost ? '' : 'disabled'}> <b>AMIGO 25th-anniversary rules</b>: no field buying; at the end of each turn every player draws 1 card.</label>
          <p class="hint">${playerCountNote(room.members.length, room.options.ruleset)}</p>
          ${isHost ? `<button class="primary big" data-action="start" ${room.members.length < 3 ? 'disabled' : ''}>Start game</button>` : '<p>Waiting for the host to start…</p>'}
          <button class="link" data-action="leave">Leave room</button>
        </div>
      </div>`;
  }

  function playerCountNote(n, rs) {
    if (n < 3) return 'Waiting for at least 3 players (the game is designed for 4–8 here).';
    const removed = n === 3 ? 'Truffle' : n <= 5 ? 'Mocha' : 'Truffle and Posy';
    let s = `With ${n} players: ${removed} beans are removed from the deck; the game ends when the draw pile runs out for the ${n === 3 ? 'second' : 'third'} time.`;
    if (n === 3) s += ' Everyone starts with three fields.';
    if (n >= 6 && rs === 'classic') s += ' Starting hands are 3, 4, 5, then 6 cards in turn order.';
    if (n === 8) s += ' (8 players is not covered by the official rules; it uses the 6–7 player setup.)';
    return s;
  }

  function nameOf(id) { return esc(room.game.players.find((p) => p.id === id)?.name || '?'); }

  function fieldHTML(p, i, mine, g) {
    const f = p.fields[i];
    const type = f.length ? f[0].t : null;
    const coins = type ? coinsForClient(type, f.length) : 0;
    const multi = p.fields.some((x) => x.length > 1);
    const canHarvest = f.length && !(f.length === 1 && multi) && g.phase !== 'over';
    let plantBtn = '';
    if (mine && g.phase !== 'over') {
      const me = p;
      const handCard = g.phase === 'plant' && g.active === room.you && me.hand?.length && g.plantedThisTurn < 2 ? me.hand[0] : null;
      const pend = g.phase === 'plantPending' && ui.selPending ? me.pending.find((c) => c.id === ui.selPending) : null;
      const c = handCard || pend;
      if (c) {
        const ok = !f.length || f[0].t === c.t;
        plantBtn = `<button class="plant ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'} data-action="${handCard ? 'plantHand' : 'plantPending'}" data-field="${i}" ${pend ? `data-card="${pend.id}"` : ''}>Plant ${BEANS[c.t].name} here</button>`;
      }
    }
    return `<div class="field ${type ? 't-' + type : 'empty'}">
      <div class="field-label">Field ${i + 1}</div>
      ${type ? `<div class="stack">${f.slice(-Math.min(f.length, mine ? 6 : 4)).map((c, k) => `<div class="stack-card" style="--k:${k}">${beanSVG(c.t, mine ? 38 : 26)}</div>`).join('')}</div>
        <div class="field-info"><b>${f.length}</b> ${BEANS[type].name}${f.length > 1 ? 's' : ''}<span class="hv"><br><span class="coin">${coins}</span> if harvested now</span></div>` : '<div class="field-empty">empty</div>'}
      ${mine && f.length ? `<button class="small" data-action="harvest" data-field="${i}" ${canHarvest ? '' : 'disabled title="Bean protection rule: you can\'t harvest a lone bean while another field has more than one."'}>Harvest for ${coins}</button>` : ''}
      ${plantBtn}
    </div>`;
  }

  function coinsForClient(t, n) { const m = BEANS[t].meter; let c = 0; m.forEach((need, k) => { if (need != null && n >= need) c = k + 1; }); return c; }

  function offerHTML(o, g) {
    const me = room.you;
    const card = (cid) => {
      const all = [...g.faceup, ...g.players.flatMap((p) => p.hand || [])];
      const c = all.find((x) => x.id === cid);
      return c ? `<span class="chip t-${c.t}">${beanSVG(c.t, 18)}${BEANS[c.t].name}</span>` : '<span class="chip">a card from their hand</span>';
    };
    const gives = o.give.map(card).join('');
    const wants = [...o.wantFaceup.map((cid) => card(cid) + '<small>(turned over)</small>'),
      ...Object.entries(o.wantTypes).map(([t, n]) => `<span class="chip t-${t}">${beanSVG(t, 18)}${n}× ${BEANS[t].name}</span>`)].join('');
    const canAccept = o.from !== me && (o.to === me || (!o.to && o.from === g.active && me !== g.active)) && !o.declinedBy.includes(me);
    const mine = o.from === me;
    let btns = '';
    if (mine) btns = `<button class="small" data-action="cancelOffer" data-id="${o.id}">Withdraw</button>`;
    else if (canAccept) btns = `<button class="small primary" data-action="accept" data-id="${o.id}">${Object.keys(o.wantTypes).length ? 'Accept…' : 'Accept'}</button><button class="small" data-action="decline" data-id="${o.id}">No thanks</button>`;
    return `<div class="offer ${canAccept ? 'for-me' : ''} ${ui.accepting === o.id ? 'accepting' : ''}">
      <div><b>${nameOf(o.from)}</b> → <b>${o.to ? nameOf(o.to) : 'anyone'}</b></div>
      <div class="offer-row"><span class="lbl">gives</span>${gives || '<i>nothing</i>'}</div>
      <div class="offer-row"><span class="lbl">wants</span>${wants || '<i>nothing (a gift)</i>'}</div>
      <div class="offer-btns">${btns}</div>
    </div>`;
  }

  function phaseText(g) {
    const act = g.players.find((p) => p.id === g.active);
    const meActive = g.active === room.you;
    const me = g.players.find((p) => p.id === room.you);
    if (g.phase === 'over') return 'Game over';
    if (g.phase === 'plant') {
      if (!meActive) return `${esc(act.name)} is planting from their hand.`;
      if (!me.hand.length) return 'Your hand is empty. Turn over two cards.';
      return g.plantedThisTurn === 0 ? '<b>Phase 1:</b> You must plant the first card of your hand.' : '<b>Phase 1:</b> You may plant your next card too, or turn over two cards.';
    }
    if (g.phase === 'trade') return meActive ? '<b>Phase 2:</b> Trade or give away beans. Turned-over cards you keep get planted when you end trading.' : `<b>Phase 2:</b> ${esc(act.name)} is trading. You may offer them cards from anywhere in your hand.`;
    if (g.phase === 'plantPending') {
      const waiting = g.players.filter((p) => p.pending.length).map((p) => esc(p.name));
      return `<b>Phase 3:</b> Plant every bean you received. Waiting on: ${waiting.join(', ')}.`;
    }
    return '';
  }

  function renderGame() {
    const g = room.game;
    const me = g.players.find((p) => p.id === room.you);
    const meActive = g.active === room.you;
    const idx = g.players.findIndex((p) => p.id === room.you);
    const others = g.players.slice(idx + 1).concat(g.players.slice(0, idx));
    const trade = g.phase === 'trade';
    const availTypes = Object.keys(BEANS).filter((t) => !g.rules.removed.includes(t));
    const passes = g.rules.runoutLimit;

    let resultHTML = '';
    if (g.phase === 'over') {
      resultHTML = `<div class="panel results"><h2>${esc(g.results[0].name)} wins!</h2><ol>${g.results.map((r) => `<li><b>${esc(r.name)}</b>: ${r.coins} coins <small>(${r.hand} cards left in hand)</small></li>`).join('')}</ol>
        <p class="hint">Ties go to ${g.rules.tiebreak === 'hand' ? 'the player with the most cards left in hand' : 'the player seated furthest from the starting player'}.</p>
        ${room.hostId === room.you ? '<button class="primary" data-action="start">Play again</button>' : ''}</div>`;
    }

    const handHTML = (me.hand || []).map((c, i) => {
      let cls = '', badge = i === 0 ? 'next' : i + 1;
      if (ui.accepting) { cls = ui.acceptSel.has(c.id) ? 'selected' : ''; }
      else if (trade && ui.give.has(c.id)) cls = 'selected';
      const clickable = trade && g.phase !== 'over';
      return cardHTML(c, { cls: cls + (clickable ? ' clickable' : '') + (i === 0 ? ' first' : ''), badge, attrs: clickable ? 'data-action="handCard"' : '' });
    }).join('');

    const faceHTML = g.faceup.map((c) => {
      const sel = meActive ? ui.give.has(c.id) : ui.wantFace.has(c.id);
      return `<div class="face-wrap">${cardHTML(c, { cls: 'clickable' + (sel ? ' selected' : ''), attrs: 'data-action="faceCard"' })}
        ${meActive ? `<button class="small" data-action="keepFaceup" data-id="${c.id}">Keep</button>` : ''}</div>`;
    }).join('');

    const accepting = ui.accepting && g.offers.find((o) => o.id === ui.accepting);
    const builder = trade ? `
      <div class="builder">
        <h4>Make an offer ${meActive ? '' : `to ${nameOf(g.active)}`}</h4>
        <div class="offer-row"><span class="lbl">you give</span>${[...ui.give].map((id) => { const c = [...g.faceup, ...me.hand].find((x) => x.id === id); return c ? `<span class="chip t-${c.t}">${beanSVG(c.t, 18)}${BEANS[c.t].name}</span>` : ''; }).join('') || `<i>tap cards in your hand${meActive ? ' or the turned-over cards' : ''}</i>`}</div>
        <div class="offer-row"><span class="lbl">you want</span>${[...ui.wantFace].map((id) => { const c = g.faceup.find((x) => x.id === id); return c ? `<span class="chip t-${c.t}">${beanSVG(c.t, 18)}${BEANS[c.t].name} (turned over)</span>` : ''; }).join('')}
          ${Object.entries(ui.wantTypes).map(([t, n]) => `<span class="chip t-${t}">${beanSVG(t, 18)}${n}× ${BEANS[t].name}</span>`).join('') || (ui.wantFace.size ? '' : '<i>nothing (gift)</i>')}
          ${Object.keys(ui.wantTypes).length || ui.wantFace.size ? '<button class="small" data-action="clearWant">clear</button>' : ''}</div>
        <div class="want-picker">${availTypes.map((t) => `<button class="bean-pick t-${t}" data-action="wantType" data-t="${t}" title="Ask for a ${BEANS[t].name} from their hand">${beanSVG(t, 26)}</button>`).join('')}</div>
        <div class="row">
          ${meActive ? `<select id="offer-to"><option value="">To anyone</option>${others.map((p) => `<option value="${p.id}" ${ui.to === p.id ? 'selected' : ''}>To ${esc(p.name)}</option>`).join('')}</select>` : ''}
          <button class="primary" data-action="sendOffer">Send offer</button>
          <button class="small" data-action="clearOffer">Reset</button>
        </div>
      </div>` : '';

    const acceptPanel = accepting ? `<div class="accept-panel">Choose the cards from your hand to give ${nameOf(accepting.from)}: needs ${Object.entries(accepting.wantTypes).map(([t, n]) => `${n}× ${BEANS[t].name}`).join(', ')}.
      <button class="primary small" data-action="confirmAccept">Confirm trade</button> <button class="small" data-action="cancelAccept">Cancel</button></div>` : '';

    $app.innerHTML = `
      <header class="topbar">
        <div class="tb-left"><b>Spill the Beans</b> <span class="code">${room.code}</span></div>
        <div class="tb-mid">
          <span class="pile" title="Draw pile">🂠 <b>${g.deckCount}</b> left</span>
          <span class="pile" title="How many times the draw pile has run out">Pile ran out <b>${g.runouts}</b>/${passes}</span>
          <span class="pile" title="Discard pile">Discard <b>${g.discardCount}</b> ${g.discardTop ? beanSVG(g.discardTop.t, 18) : ''}</span>
        </div>
        <div class="tb-right"><button class="small" data-action="toggleSide">Log / chat</button></div>
      </header>
      ${g.endTriggered && g.phase !== 'over' ? '<div class="banner warn">The draw pile has run out for the last time. The game ends after this turn\'s planting.</div>' : ''}
      <div class="banner ${meActive ? 'mine' : ''}">${phaseText(g)}</div>
      ${resultHTML}
      <section class="opponents">${others.map((p) => `
        <div class="opp ${p.id === g.active ? 'active' : ''}">
          <div class="opp-head"><span class="dot ${room.members.find((m) => m.id === p.id)?.online ? 'on' : ''}"></span><b>${esc(p.name)}</b>${p.id === g.startPlayer ? ' <span class="muted" title="Starting player">· 1st</span>' : ''}
            <span class="opp-stats"><span title="Cards in hand">🂠 ${p.handCount}</span> <span class="coin" title="Coins">${p.coins}</span></span></div>
          <div class="opp-fields">${p.fields.map((_, i) => fieldHTML(p, i, false, g)).join('')}</div>
          ${p.pending.length ? `<div class="pending small">to plant: ${p.pending.map((c) => `<span class="chip t-${c.t}">${beanSVG(c.t, 16)}${BEANS[c.t].name}</span>`).join('')}</div>` : ''}
          ${g.phase === 'over' && p.hand ? '' : ''}
        </div>`).join('')}
      </section>
      <section class="market">
        <div class="market-cards">
          <h4>${trade ? `Turned over by ${nameOf(g.active)}` : 'Turned-over cards'}</h4>
          <div class="cards">${faceHTML || '<i class="muted">none right now</i>'}</div>
          ${meActive && g.phase === 'plant' && (g.plantedThisTurn > 0 || !me.hand.length) ? '<button class="primary big" data-action="endPlanting">Turn over two cards</button>' : ''}
          ${meActive && trade ? '<button class="primary big" data-action="endTrading">End trading</button>' : ''}
        </div>
        <div class="offers">
          <h4>Trade offers</h4>
          ${g.offers.filter((o) => !(o.declinedBy.includes(room.you) && o.from !== room.you)).map((o) => offerHTML(o, g)).join('') || '<i class="muted">No open offers.</i>'}
        </div>
        ${builder}
      </section>
      <section class="mine ${meActive ? 'active' : ''}">
        <div class="mine-head"><b>Your farm</b> <span class="coin big-coin">${me.coins}</span> coins
          ${g.rules.canBuyField && !me.boughtField && g.phase !== 'over' ? `<button class="small" data-action="buyField" ${me.coins >= g.rules.fieldCost ? '' : 'disabled'}>Buy 3rd field (${g.rules.fieldCost} coins)</button>` : ''}
        </div>
        ${me.pending.length ? `<div class="pending">
          <b>${g.phase === 'plantPending' ? 'Plant these now:' : 'Received, planted after trading:'}</b>
          <div class="cards">${me.pending.map((c) => cardHTML(c, { small: true, cls: 'clickable' + (ui.selPending === c.id ? ' selected' : ''), attrs: 'data-action="selPending"' })).join('')}</div>
          ${g.phase === 'plantPending' ? '<span class="hint">Tap a card, then "Plant here" on a field. No room? Harvest a field first.</span>' : ''}
        </div>` : ''}
        <div class="my-fields">${me.fields.map((_, i) => fieldHTML(me, i, true, g)).join('')}</div>
        ${acceptPanel}
        <h4>Your hand <small>(order is fixed: you plant from the left, new cards go on the right)</small></h4>
        <div class="cards hand">${handHTML || '<i class="muted">empty</i>'}</div>
      </section>`;
  }

  function rulesHTML() {
    const rows = Object.entries(BEANS).map(([t, b]) => `<tr><td>${beanSVG(t, 26)}</td><td>${b.name}</td><td>${b.count}</td><td>${b.meter.map((n, k) => n == null ? '' : `${n}→${k + 1}`).filter(Boolean).join(' · ')}</td></tr>`).join('');
    return `<h3>How to play</h3>
      <p>Grow beans in your fields and harvest them for coins. Most coins at the end wins.</p>
      <ul>
        <li><b>Never reorder your hand.</b> You always plant from the front; new cards go to the back.</li>
        <li>Each field holds one kind of bean. You can harvest a field at any time, even on someone else's turn, but not a lone bean while another field has two or more.</li>
        <li><b>1. Plant:</b> you must plant your first hand card, and may plant the next one.</li>
        <li><b>2. Turn over & trade:</b> two cards are turned over. Only the active player trades, with anyone, using those cards and any cards from their hand. Gifts are allowed if accepted. Cards you receive must be planted and cannot be traded on.</li>
        <li><b>3. Plant received beans:</b> everyone plants what they received; the active player also plants turned-over cards they kept.</li>
        <li><b>4. Draw:</b> Classic: the active player draws 3 (4 with 6+ players). AMIGO: every player draws 1.</li>
        <li>When the draw pile runs out, the discards are reshuffled. The game ends when it runs out for the 3rd time (2nd with 3 players). Then all fields are harvested.</li>
      </ul>
      <table class="bean-table"><tr><th></th><th>Bean</th><th>Cards</th><th>Cards → coins</th></tr>${rows}</table>`;
  }

  function renderSide() {
    document.querySelectorAll('.side-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    document.getElementById('chat-form').hidden = ui.tab !== 'chat';
    if (ui.tab === 'log') {
      const log = room.game ? room.game.log : [];
      $sideBody.innerHTML = log.slice().reverse().map((l) => `<div class="log-line">${esc(l.text)}</div>`).join('') || '<i class="muted">Nothing yet.</i>';
    } else if (ui.tab === 'chat') {
      $sideBody.innerHTML = room.chat.map((c) => `<div class="chat-line"><b>${esc(c.from)}:</b> ${esc(c.text)}</div>`).join('') || '<i class="muted">No messages yet.</i>';
      $sideBody.scrollTop = $sideBody.scrollHeight;
    } else {
      $sideBody.innerHTML = rulesHTML();
    }
  }

  // ---------- events ----------
  document.addEventListener('change', (e) => {
    if (e.target.name === 'ruleset') send({ t: 'options', options: { ruleset: e.target.value } });
    if (e.target.id === 'offer-to') ui.to = e.target.value;
  });

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = document.getElementById('chat-input');
    if (i.value.trim()) send({ t: 'chat', text: i.value });
    i.value = '';
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    const g = room?.game;
    const cardId = el.dataset.card;
    switch (a) {
      case 'create': case 'join': {
        const name = (document.getElementById('name').value || '').trim();
        if (!name) return toast('Enter your name first.');
        try { localStorage.setItem('bb-name', name); } catch {}
        session = { name };
        if (a === 'create') connect({ t: 'create', name });
        else {
          const code = document.getElementById('code').value.trim().toUpperCase();
          if (code.length !== 4) return toast('Enter the 4-letter room code.');
          connect({ t: 'join', code, name });
        }
        return;
      }
      case 'rules-home': ui.showRules = !ui.showRules; return render();
      case 'copy': navigator.clipboard?.writeText(el.dataset.text).then(() => toast('Link copied.')); return;
      case 'seat': {
        const ids = room.members.map((m) => m.id); const i = +el.dataset.i, j = i + +el.dataset.d;
        [ids[i], ids[j]] = [ids[j], ids[i]]; return send({ t: 'seat', order: ids });
      }
      case 'kick': return send({ t: 'kick', id: el.dataset.id });
      case 'leave': send({ t: 'leave' }); wantConnect = false; ws.close(); session = null; save(); room = null; history.replaceState(null, '', '/'); return render();
      case 'start': return send({ t: 'start' });
      case 'tab': ui.tab = el.dataset.tab; return renderSide();
      case 'toggleSide': $side.classList.toggle('open'); return;
      case 'plantHand': return act({ type: 'plantHand', field: +el.dataset.field });
      case 'plantPending': return act({ type: 'plantPending', cardId: el.dataset.card, field: +el.dataset.field });
      case 'selPending': ui.selPending = cardId; return render();
      case 'harvest': return act({ type: 'harvest', field: +el.dataset.field });
      case 'buyField': if (confirm(`Spend ${g.rules.fieldCost} coins on a third bean field?`)) act({ type: 'buyField' }); return;
      case 'endPlanting': return act({ type: 'endPlanting' });
      case 'endTrading': return act({ type: 'endTrading' });
      case 'keepFaceup': ui.give.delete(el.dataset.id); return act({ type: 'keepFaceup', cardId: el.dataset.id });
      case 'handCard':
        if (ui.accepting) { ui.acceptSel.has(cardId) ? ui.acceptSel.delete(cardId) : ui.acceptSel.add(cardId); }
        else { ui.give.has(cardId) ? ui.give.delete(cardId) : ui.give.add(cardId); }
        return render();
      case 'faceCard':
        if (g.phase !== 'trade') return;
        if (g.active === room.you) ui.give.has(cardId) ? ui.give.delete(cardId) : ui.give.add(cardId);
        else ui.wantFace.has(cardId) ? ui.wantFace.delete(cardId) : ui.wantFace.add(cardId);
        return render();
      case 'wantType': ui.wantTypes[el.dataset.t] = (ui.wantTypes[el.dataset.t] || 0) + 1; return render();
      case 'clearWant': ui.wantTypes = {}; ui.wantFace.clear(); return render();
      case 'clearOffer': ui.give.clear(); ui.wantTypes = {}; ui.wantFace.clear(); return render();
      case 'sendOffer': {
        if (!ui.give.size && !ui.wantFace.size && !Object.keys(ui.wantTypes).length) return toast('Pick cards to give or ask for first.');
        act({ type: 'offer', to: g.active === room.you ? ui.to || null : g.active, give: [...ui.give], wantFaceup: [...ui.wantFace], wantTypes: ui.wantTypes });
        ui.give.clear(); ui.wantFace.clear(); ui.wantTypes = {};
        return;
      }
      case 'cancelOffer': return act({ type: 'cancelOffer', offerId: el.dataset.id });
      case 'decline': return act({ type: 'declineOffer', offerId: el.dataset.id });
      case 'accept': {
        const o = g.offers.find((x) => x.id === el.dataset.id);
        if (!Object.keys(o.wantTypes).length) return act({ type: 'acceptOffer', offerId: o.id, cards: [] });
        const me = g.players.find((p) => p.id === room.you);
        // Preselect matching cards from the back of the hand; the player can change them.
        ui.accepting = o.id; ui.acceptSel.clear(); ui.give.clear();
        for (const [t, n] of Object.entries(o.wantTypes)) {
          const m = me.hand.filter((c) => c.t === t).slice(-n);
          if (m.length < n) { ui.accepting = null; ui.acceptSel.clear(); return toast(`You don't have ${n}× ${BEANS[t].name} in your hand.`); }
          m.forEach((c) => ui.acceptSel.add(c.id));
        }
        return render();
      }
      case 'confirmAccept': act({ type: 'acceptOffer', offerId: ui.accepting, cards: [...ui.acceptSel] }); ui.accepting = null; ui.acceptSel.clear(); return;
      case 'cancelAccept': ui.accepting = null; ui.acceptSel.clear(); return render();
    }
  });

  // ---------- boot ----------
  fetch('/beans.json').then((r) => r.json()).then((b) => {
    window.BEANS = b;
    const path = location.pathname.match(/^\/r\/([A-Za-z]{4})/);
    if (session && (!path || path[1].toUpperCase() === session.code)) connect();
    render();
  });
})();
