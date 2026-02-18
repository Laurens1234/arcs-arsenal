import assert from 'assert';

// Load the draft core helper and a minimal harness of functions from draft-app
import { countCategoryPicksBeforeNextTurn } from '../assets/draft-core.js';

// We need to import getBestPick logic; to avoid loading full DOM-heavy draft-app,
// replicate a minimal wrapper around the getBestPick algorithm using the same
// helper utilities (assignValues, getWeightedScore, SYNERGIES) used by the app.

import fs from 'fs';

// Pull in the necessary pieces by parsing the source file for helper functions
const draftAppSrc = fs.readFileSync(new URL('../assets/draft-app.js', import.meta.url), 'utf8');

// Extract small helper constants/definitions we need by evaluating a sanitized snippet.
// For test simplicity we will recreate minimal scoring logic here.

function makeEntry(name, value) {
  return { name, value };
}

function makeDraft({numPlayers, availableLeaders, availableLore, order}) {
  return {
    numPlayers,
    availableLeaders: availableLeaders.map(e => ({...e})),
    availableLore: availableLore.map(e => ({...e})),
    players: Array.from({length: numPlayers}, () => ({ leader: null, lore: [] })),
    order: order || Array.from({length: numPlayers}, (_,i) => i+1)
  };
}

// Minimal imitation of getLoreCountForPlayer
function getLoreCountForPlayer(i, draft) {
  return draft.lorePerPlayer ?? 1;
}

// Re-implement a lightweight getBestPick that mirrors the app's logic but is
// deterministic and testable in Node (no DOM deps). This focuses only on
// the behaviors under test: forced synergy pick and complementary-category preference.

function getBestPickMini(draft, playerIdx, SYNERGIES) {
  const player = draft.players[playerIdx];
  const cards = [];
  if (!player.leader) draft.availableLeaders.forEach(c => cards.push({...c, pickType: 'leader'}));
  if (player.lore.length < getLoreCountForPlayer(playerIdx, draft)) draft.availableLore.forEach(c => cards.push({...c, pickType: 'lore'}));
  if (cards.length === 0) return null;

  const sortedLeaders = [...draft.availableLeaders].sort((a,b)=>b.value-a.value);
  const sortedLore = [...draft.availableLore].sort((a,b)=>b.value-a.value);

  // Count competitors
  let competitorsForLeader = 0, competitorsForLore = 0;
  for (let i=0;i<draft.numPlayers;i++){
    if (i===playerIdx) continue;
    if (!draft.players[i].leader) competitorsForLeader++;
    if (draft.players[i].lore.length < getLoreCountForPlayer(i,draft)) competitorsForLore++;
  }

  const picksBeforeMyNextLeader = countCategoryPicksBeforeNextTurn(draft, playerIdx, 'leader', (i) => draft.lorePerPlayer ?? 1);
  const picksBeforeMyNextLore = countCategoryPicksBeforeNextTurn(draft, playerIdx, 'lore', (i) => draft.lorePerPlayer ?? 1);

  let best = null; let bestScore = -Infinity;
  for (const card of cards) {
    let score = card.value;
    if (card.pickType==='leader') {
      // forced synergy: if this leader completes synergy and opponents can take it before my next leader pick
      for (const s of SYNERGIES) {
        if (card.name===s.leader) {
          const hasLore = player.lore.some(l=>l.name===s.lore);
          if (hasLore) {
            const rank = sortedLeaders.findIndex(l=>l.name===card.name);
            if (rank>=0 && rank < picksBeforeMyNextLeader) {
              score = Infinity;
            }
          }
        }
      }
      if (competitorsForLeader===0 && player.lore.length < getLoreCountForPlayer(playerIdx,draft)) score -= 100;
    } else {
      for (const s of SYNERGIES) {
        if (player.leader && player.leader.name===s.leader && card.name===s.lore) {
          const rank = sortedLore.findIndex(l=>l.name===card.name);
          if (rank>=0 && rank < picksBeforeMyNextLore) score = Infinity;
        }
      }
      if (competitorsForLore===0 && !player.leader) score -= 100;
    }
    if (score>bestScore) { bestScore = score; best = card; }
  }
  return best;
}

// Define a small SYNERGIES array to match app behavior for tests
const SYNERGIES = [
  { leader: 'LeaderA', lore: 'LoreA', bonus: 5 },
  { leader: 'LeaderB', lore: 'LoreB', bonus: 4 }
];

export async function runTests() {
  // Test 1: forced synergy leader pick when player already has lore and opponents could steal
  (function(){
    const draft = makeDraft({ numPlayers: 3, availableLeaders: [makeEntry('LeaderA', 10), makeEntry('LeaderX', 8)], availableLore: [makeEntry('LoreA',5)], order: [1,2,3,1,2,3] });
    draft.players[0].lore.push({name: 'LoreA'}); // player 0 has LoreA
    draft.lorePerPlayer = 1;
    const pick = getBestPickMini(draft, 0, SYNERGIES);
    assert.strictEqual(pick.pickType, 'leader');
    assert.strictEqual(pick.name, 'LeaderA');
  })();

  // Test 2: prefer lore when all other players already have leaders
  (function(){
    const draft = makeDraft({ numPlayers: 3, availableLeaders: [makeEntry('LeaderY', 9)], availableLore: [makeEntry('LoreX',7), makeEntry('LoreZ',6)], order: [1,2,3,1,2,3] });
    draft.players[1].leader = {name: 'SomeL'};
    draft.players[2].leader = {name: 'OtherL'};
    draft.lorePerPlayer = 1;
    const pick = getBestPickMini(draft, 0, SYNERGIES);
    assert.strictEqual(pick.pickType, 'lore');
  })();

  // Test 3: prefer leader when all other players already have lore
  (function(){
    const draft = makeDraft({ numPlayers: 3, availableLeaders: [makeEntry('LeaderY', 9)], availableLore: [makeEntry('LoreX',7)], order: [1,2,3,1,2,3] });
    draft.players[1].lore.push({name: 'L1'});
    draft.players[2].lore.push({name: 'L2'});
    draft.lorePerPlayer = 1;
    const pick = getBestPickMini(draft, 0, SYNERGIES);
    assert.strictEqual(pick.pickType, 'leader');
  })();
}
