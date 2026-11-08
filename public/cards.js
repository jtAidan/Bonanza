// Original bean art, drawn as inline SVG.
window.BEAN_STYLE = {
  mocha:   { fill: '#6b4226', dark: '#432713', light: '#9a6a46', mark: 'crease' },
  butter:  { fill: '#f1d77e', dark: '#c9a845', light: '#fff2bf', mark: 'shine' },
  indigo:  { fill: '#3e5bd6', dark: '#26398f', light: '#8fa4ff', mark: 'dots' },
  ember:   { fill: '#e2462b', dark: '#9d2412', light: '#ffa064', mark: 'flame' },
  skunk:   { fill: '#4d3f5f', dark: '#2c2238', light: '#f4f0f8', mark: 'stripe' },
  snap:    { fill: '#4fae4a', dark: '#2d7a2a', light: '#a6e39b', mark: 'seam' },
  sunny:   { fill: '#e5bd57', dark: '#ac8526', light: '#fff0b0', mark: 'sun' },
  owl:     { fill: '#f1e7d2', dark: '#b9a888', light: '#ffffff', mark: 'eye' },
  ruby:    { fill: '#b0163d', dark: '#700c25', light: '#ff6d8f', mark: 'gem' },
  posy:    { fill: '#ee8fbf', dark: '#b35287', light: '#ffd4ea', mark: 'flower' },
  truffle: { fill: '#3a2417', dark: '#1e110a', light: '#d8a946', mark: 'speckle' },
};

window.beanSVG = function (type, size = 48) {
  const s = window.BEAN_STYLE[type];
  const id = 'g' + type;
  const body = 'M14 8c10-5 26-3 32 8 6 10 2 24-8 31-9 6-24 7-31-2-6-8-2-15 3-18 4-2 6-5 4-9-2-4-5-7 0-10z';
  const marks = {
    crease: `<path d="M24 12c8 6 10 18 4 30" stroke="${s.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    shine: `<ellipse cx="34" cy="18" rx="7" ry="4" fill="${s.light}" opacity=".8" transform="rotate(30 34 18)"/>`,
    dots: `<circle cx="22" cy="18" r="2.5" fill="${s.light}"/><circle cx="36" cy="22" r="2.5" fill="${s.light}"/><circle cx="30" cy="34" r="2.5" fill="${s.light}"/><circle cx="18" cy="40" r="2" fill="${s.light}"/>`,
    flame: `<path d="M30 40c-6-4-4-12 0-16 0 5 4 5 4 9 2-2 2-5 1-7 5 4 5 12-5 14z" fill="${s.light}"/>`,
    stripe: `<path d="M18 9c8 2 16 10 20 22s0 18-4 20" stroke="${s.light}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    seam: `<path d="M16 12c10 2 22 12 22 26" stroke="${s.dark}" stroke-width="2" fill="none" stroke-dasharray="3 3"/>`,
    sun: `<circle cx="30" cy="27" r="6" fill="${s.light}"/><g stroke="${s.light}" stroke-width="2" stroke-linecap="round"><path d="M30 16v-3M30 41v-3M19 27h-3M44 27h-3M22 19l-2-2M40 37l-2-2M22 35l-2 2M40 17l-2 2"/></g>`,
    eye: `<ellipse cx="28" cy="26" rx="7" ry="5" fill="#1d1a17"/><circle cx="26" cy="24.5" r="1.6" fill="#fff"/>`,
    gem: `<path d="M26 18l8 0 4 6-8 10-8-10z" fill="${s.light}" opacity=".85"/>`,
    flower: `<g fill="${s.light}"><circle cx="30" cy="22" r="3.5"/><circle cx="36" cy="27" r="3.5"/><circle cx="33" cy="33" r="3.5"/><circle cx="26" cy="33" r="3.5"/><circle cx="24" cy="26" r="3.5"/></g><circle cx="29.5" cy="28" r="3" fill="#f7d14a"/>`,
    speckle: `<g fill="${s.light}"><circle cx="20" cy="16" r="1.6"/><circle cx="32" cy="14" r="1.3"/><circle cx="38" cy="26" r="1.8"/><circle cx="26" cy="28" r="1.4"/><circle cx="30" cy="40" r="1.7"/><circle cx="18" cy="38" r="1.2"/></g>`,
  };
  return `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">
    <defs><radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${s.light}" stop-opacity=".55"/><stop offset=".45" stop-color="${s.fill}"/><stop offset="1" stop-color="${s.dark}"/></radialGradient></defs>
    <path d="${body}" fill="url(#${id})" stroke="${s.dark}" stroke-width="1.5"/>
    ${marks[s.mark]}
    <path d="M14 8c-2-4 0-7 4-7" stroke="#3f7d2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M18 1c3-1 7 0 8 3-4 1-7 0-8-3z" fill="#5fae3d"/>
  </svg>`;
};

window.meterHTML = function (b) {
  return '<div class="meter">' + b.meter.map((need, k) => need == null ? '' :
    `<span title="${need} cards = ${k + 1} coin${k ? 's' : ''}"><b>${need}</b><i>${k + 1}</i></span>`).join('') + '</div>';
};

window.cardHTML = function (card, opts = {}) {
  const b = window.BEANS[card.t];
  const cls = ['card', 't-' + card.t, opts.cls || ''].join(' ');
  const attrs = opts.attrs || '';
  return `<div class="${cls}" ${attrs} data-card="${card.id}">
    <div class="card-count">×${b.count}</div>
    <div class="card-art">${window.beanSVG(card.t, opts.small ? 34 : 50)}</div>
    <div class="card-name">${b.name}</div>
    ${opts.small ? '' : window.meterHTML(b)}
    ${opts.badge ? `<div class="card-badge">${opts.badge}</div>` : ''}
  </div>`;
};
