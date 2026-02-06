// ========== Community Draft Data ==========
// Static data from community games (not dynamically fetched).
// Rankings show draft pick priority (higher = picked earlier).
// Win rates show how often a card won when picked.

export const COMMUNITY_DATA = {
  "3p": {
    games: 983,
    ranking: [
      "Noble", "Archivist", "Living Structures", "Rebel", "Sprinter Drives",
      "Quartermaster", "Mystic", "Anarchist", "Hidden Harbors", "Galactic Rifles",
      "Warrior", "Repair Drones", "Elder", "Upstart", "Feastbringer",
      "Gate Ports", "Mirror Plating", "Overseer", "Empath's Bond", "Demagogue",
      "Agitator", "Empath's Vision", "Seeker Torpedoes", "Tool Priests",
      "Gate Stations", "Railgun Arrays", "Predictive Sensors", "Corsair",
      "Warlord's Terror", "Tyrant's Authority", "Keeper's Solidarity", "Fuel-Drinker",
      "Tycoon's Charm", "Tycoon's Ambition", "Warlord's Cruelty", "Shaper",
      "Tyrant's Ego", "Keeper's Trust", "Signal Breaker", "Force Beams",
      "Cloud Cities", "Survival Overrides", "Ancient Holdings", "Raider Exosuits",
    ],
    leaderWinrates: {
      "Noble": 51, "Anarchist": 43, "Quartermaster": 43, "Upstart": 41,
      "Archivist": 40, "Elder": 39, "Fuel-Drinker": 33, "Overseer": 32,
      "Rebel": 32, "Mystic": 32, "Corsair": 28, "Demagogue": 28,
      "Agitator": 25, "Feastbringer": 22, "Shaper": 19, "Warrior": 19,
    },
    loreWinrates: {
      "Living Structures": 54, "Sprinter Drives": 47, "Repair Drones": 42,
      "Empath's Bond": 39, "Tyrant's Authority": 38, "Tool Priests": 37,
      "Seeker Torpedoes": 35, "Hidden Harbors": 35, "Warlord's Terror": 35,
      "Empath's Vision": 35, "Tycoon's Ambition": 34, "Railgun Arrays": 33,
      "Signal Breaker": 32, "Ancient Holdings": 32, "Gate Stations": 31,
      "Galactic Rifles": 31, "Gate Ports": 31, "Mirror Plating": 31,
      "Tycoon's Charm": 31, "Warlord's Cruelty": 28, "Cloud Cities": 26,
      "Tyrant's Ego": 25, "Force Beams": 24, "Raider Exosuits": 24,
      "Predictive Sensors": 24, "Keeper's Solidarity": 22, "Survival Overrides": 21,
      "Keeper's Trust": 19,
    },
  },
  "4p": {
    games: 1272,
    ranking: [
      "Living Structures", "Noble", "Quartermaster", "Anarchist", "Sprinter Drives",
      "Archivist", "Feastbringer", "Demagogue", "Hidden Harbors", "Mystic",
      "Rebel", "Tool Priests", "Galactic Rifles", "Overseer", "Repair Drones",
      "Elder", "Seeker Torpedoes", "Gate Ports", "Warrior", "Fuel-Drinker",
      "Mirror Plating", "Predictive Sensors", "Empath's Bond", "Keeper's Solidarity",
      "Railgun Arrays", "Gate Stations", "Corsair", "Upstart", "Empath's Vision",
      "Warlord's Terror", "Tycoon's Ambition", "Tyrant's Authority", "Tycoon's Charm",
      "Agitator", "Signal Breaker", "Tyrant's Ego", "Force Beams", "Cloud Cities",
      "Warlord's Cruelty", "Shaper", "Keeper's Trust", "Raider Exosuits",
      "Ancient Holdings", "Survival Overrides",
    ],
    leaderWinrates: {
      "Noble": 39, "Anarchist": 37, "Mystic": 32, "Archivist": 31,
      "Quartermaster": 28, "Feastbringer": 28, "Upstart": 27, "Rebel": 26,
      "Overseer": 23, "Demagogue": 23, "Elder": 22, "Fuel-Drinker": 19,
      "Corsair": 18, "Agitator": 18, "Warrior": 14, "Shaper": 11,
    },
    loreWinrates: {
      "Living Structures": 37, "Sprinter Drives": 34, "Hidden Harbors": 31,
      "Tool Priests": 30, "Galactic Rifles": 30, "Keeper's Solidarity": 29,
      "Seeker Torpedoes": 27, "Railgun Arrays": 26, "Tycoon's Ambition": 26,
      "Mirror Plating": 26, "Empath's Bond": 26, "Predictive Sensors": 25,
      "Repair Drones": 25, "Tycoon's Charm": 25, "Gate Ports": 25,
      "Cloud Cities": 25, "Ancient Holdings": 24, "Gate Stations": 24,
      "Empath's Vision": 22, "Signal Breaker": 21, "Warlord's Cruelty": 20,
      "Tyrant's Authority": 20, "Warlord's Terror": 20, "Tyrant's Ego": 19,
      "Force Beams": 19, "Keeper's Trust": 17, "Raider Exosuits": 15,
      "Survival Overrides": 13,
    },
    unpickedLeaders: {
      "Shaper": 31, "Upstart": 28, "Corsair": 28, "Agitator": 26, "Fuel-Drinker": 23,
    },
    unpickedLore: {
      "Survival Overrides": 28, "Raider Exosuits": 27, "Tycoon's Ambition": 25,
      "Ancient Holdings": 25, "Keeper's Trust": 23,
    },
  },
};

/**
 * Build stats objects from community data.
 * Only includes actual data: ranking position and win rate.
 * No fabricated picks or wins — we don't have that data.
 *
 * @param {"3p"|"4p"} playerCount
 * @returns {{ stats: Array<{name,type,rankPosition,winRate,isCommunity:true}>, games: number }}
 */
export function buildCommunityStats(playerCount) {
  const data = COMMUNITY_DATA[playerCount];
  if (!data) return { stats: [], games: 0 };

  const stats = [];

  for (let i = 0; i < data.ranking.length; i++) {
    const name = data.ranking[i];
    const position = i + 1;

    if (data.leaderWinrates[name] !== undefined) {
      stats.push({
        name,
        type: "Leader",
        rankPosition: position,
        winRate: data.leaderWinrates[name],
        isCommunity: true,
      });
    } else if (data.loreWinrates[name] !== undefined) {
      stats.push({
        name,
        type: "Lore",
        rankPosition: position,
        winRate: data.loreWinrates[name],
        isCommunity: true,
      });
    }
  }

  return { stats, games: data.games };
}
