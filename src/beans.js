// Bean varieties. Counts and payouts follow the real card game; names and art are original.
// meter[k] = number of cards in a field needed to earn (k+1) coins; null = that coin value is not reachable.
const BEANS = {
  mocha:   { name: 'Mocha Bean',    count: 24, meter: [4, 7, 10, 12], role: 'coffee' },
  butter:  { name: 'Butter Bean',   count: 22, meter: [4, 7, 9, 11],  role: 'wax' },
  indigo:  { name: 'Indigo Bean',   count: 20, meter: [4, 6, 8, 10],  role: 'blue' },
  ember:   { name: 'Ember Bean',    count: 18, meter: [3, 6, 8, 9],   role: 'chili' },
  skunk:   { name: 'Skunk Bean',    count: 16, meter: [3, 5, 7, 8],   role: 'stink' },
  snap:    { name: 'Snap Bean',     count: 14, meter: [3, 5, 6, 7],   role: 'green' },
  sunny:   { name: 'Sunny Bean',    count: 12, meter: [2, 4, 6, 7],   role: 'soy' },
  owl:     { name: 'Owl-eye Bean',  count: 10, meter: [2, 4, 5, 6],   role: 'blackeyed' },
  ruby:    { name: 'Ruby Bean',     count: 8,  meter: [2, 3, 4, 5],   role: 'red' },
  posy:    { name: 'Posy Bean',     count: 6,  meter: [null, 2, 3, null], role: 'garden' },
  truffle: { name: 'Truffle Bean',  count: 4,  meter: [null, 2, 3, 4],    role: 'cocoa' },
};

function coinsFor(type, n) {
  const m = BEANS[type].meter;
  let coins = 0;
  for (let k = 0; k < m.length; k++) if (m[k] != null && n >= m[k]) coins = k + 1;
  return coins;
}

module.exports = { BEANS, coinsFor };
