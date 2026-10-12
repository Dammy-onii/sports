import { ATTRIBUTE_KEYS, DEFAULT_INSTRUCTIONS, GK_KEYS, POSITION_WEIGHTS } from "./constants";
import { generateStaff, newContract, staffLevel } from "./economy";
import { autoStatuses } from "./squad";
import { autoPickLineup, autoRoles } from "./tactics";
import { initialFamiliarity, initialRoleExp } from "./familiarity";
import { generateManager } from "./managers";
import { Rng, hashString } from "./rng";
import type { SeasonStats, Attributes, Traits, Club, ClubColors, CrestDesign, FormationId, League, Player, Position } from "./types";
import { roundRobin } from "./competition";
import { appointStaff } from "./staff";

// Entirely fictional name pools, grouped loosely by "region" for flavour.
const NAME_POOLS: { nat: string; first: string[]; last: string[] }[] = [
  {
    nat: "ENG",
    first: ["Jack", "Harry", "Oliver", "Callum", "Lewis", "Ryan", "Tom", "Danny", "Josh", "Kieran", "Alfie", "Reece", "Mason", "Ethan", "Jamie", "Connor", "Luke", "Sam", "Ben", "Owen"],
    last: ["Hartley", "Brookes", "Pemberton", "Ashworth", "Fenwick", "Calloway", "Thornley", "Whitlock", "Rainford", "Cottrell", "Merriman", "Holloway", "Barraclough", "Kettering", "Lowther", "Pickford", "Sutcliffe", "Wainwright", "Haddon", "Mallory", "Ormerod", "Rowntree"],
  },
  {
    nat: "ESP",
    first: ["Javier", "Mateo", "Iker", "Adrián", "Sergio", "Pablo", "Unai", "Álvaro", "Rubén", "Dani", "Marcos", "Hugo", "Gonzalo", "Raúl", "Óscar"],
    last: ["Ferrán", "Olmedo", "Castañar", "Ibarrola", "Montero", "Velasco", "Arriaga", "Quintana", "Salcedo", "Zubiría", "Garrido", "Navarro", "Echeverría", "Lozano", "Bermejo", "Cabrera"],
  },
  {
    nat: "BRA",
    first: ["Thiago", "Rafael", "Lucas", "Gabriel", "Vinícius", "Matheus", "Caio", "Felipe", "Diego", "Renan", "Igor", "Murilo", "Wesley", "Danilo"],
    last: ["Andrade", "Moraes", "Teixeira", "Barbosa", "Cardoso", "Nogueira", "Prado", "Rezende", "Siqueira", "Valadão", "Fonseca", "Campos", "Leite", "Macedo", "Peixoto"],
  },
  {
    nat: "NGA",
    first: ["Chidi", "Tobi", "Emeka", "Seun", "Ikenna", "Femi", "Kelechi", "Dayo", "Uche", "Tunde", "Chinedu", "Bayo", "Obinna", "Wale"],
    last: ["Okonkwo", "Adeyemi", "Nwosu", "Balogun", "Eze", "Okafor", "Adebayo", "Obi", "Afolabi", "Chukwu", "Oyelaran", "Nnamdi", "Ogunleye", "Ihejirika", "Akinola"],
  },
  {
    nat: "FRA",
    first: ["Théo", "Hugo", "Mathis", "Antoine", "Nathan", "Kylian", "Rayan", "Enzo", "Bastien", "Loïc", "Maxime", "Quentin", "Yanis", "Clément"],
    last: ["Delacroix", "Morel", "Fournier", "Lambert", "Girard", "Rousseau", "Bonnet", "Chevalier", "Marchand", "Perrin", "Lefebvre", "Gauthier", "Mercier", "Barbier", "Renaud"],
  },
  {
    nat: "GER",
    first: ["Lukas", "Jonas", "Felix", "Leon", "Niklas", "Tim", "Moritz", "Jannik", "Paul", "Fabian", "Maximilian", "Julian", "Florian", "Kai"],
    last: ["Brandt", "Kessler", "Hoffmann", "Vogt", "Reinhardt", "Albrecht", "Winkler", "Lorenz", "Krause", "Seidel", "Engel", "Hartmann", "Ziegler", "Baumann", "Kuhn"],
  },
  {
    nat: "ITA",
    first: ["Lorenzo", "Matteo", "Federico", "Alessio", "Nicolò", "Davide", "Simone", "Andrea", "Riccardo", "Gianluca", "Tommaso", "Pietro", "Edoardo"],
    last: ["Bellandi", "Ferraro", "Gallo", "Rinaldi", "Marchetti", "Conti", "Bruno", "De Santis", "Lombardi", "Moretti", "Fabbri", "Caruso", "Pellegrini", "Valentini", "Testa"],
  },
  {
    nat: "GHA",
    first: ["Kwame", "Kofi", "Yaw", "Kwabena", "Nana", "Kojo", "Ebo", "Fiifi", "Kwesi", "Yaw"],
    last: ["Mensah", "Boateng", "Owusu", "Asante", "Appiah", "Darko", "Ofori", "Amoako", "Agyeman", "Osei", "Frimpong"],
  },
  {
    nat: "NED",
    first: ["Daan", "Sem", "Luuk", "Bram", "Jesse", "Stijn", "Thijs", "Milan", "Ruben"],
    last: ["de Vries", "van Dijkstra", "Bakker", "Visser", "Smit", "Mulder", "de Groot", "Bosman", "Kuipers", "van Leeuwen", "Hendriks"],
  },
  {
    nat: "POR",
    first: ["João", "Tiago", "Rui", "Diogo", "Gonçalo", "André", "Nuno", "Rafael", "Bruno"],
    last: ["Carvalho", "Ferreira", "Gomes", "Lopes", "Marques", "Pinto", "Ribeiro", "Sousa", "Tavares", "Correia", "Mendes"],
  },
  {
    nat: "ARG",
    first: ["Facundo", "Nahuel", "Lautaro", "Joaquín", "Agustín", "Thiago", "Franco", "Valentín", "Ezequiel"],
    last: ["Acosta", "Benítez", "Coronel", "Domínguez", "Giménez", "Ledesma", "Medina", "Paredes", "Quiroga", "Sosa", "Villalba"],
  },
  {
    nat: "SEN",
    first: ["Moussa", "Cheikh", "Ibrahima", "Pape", "Abdou", "Mamadou", "Ousmane", "Lamine"],
    last: ["Diallo", "Ndiaye", "Sarr", "Faye", "Diop", "Cissé", "Gueye", "Mbaye", "Sow", "Thiam"],
  },
  {
    nat: "JPN",
    first: ["Haruto", "Ren", "Sota", "Yuto", "Kaito", "Riku", "Daiki", "Takumi"],
    last: ["Takahashi", "Nakamura", "Kobayashi", "Yamamoto", "Matsuda", "Inoue", "Fujita", "Morimoto", "Shimizu"],
  },
  {
    nat: "USA",
    first: ["Tyler", "Brandon", "Cole", "Logan", "Austin", "Caleb", "Jordan", "Dylan"],
    last: ["Whitaker", "Callahan", "Brennan", "Holt", "Mercer", "Sawyer", "Garrison", "Langley", "Pruitt"],
  },
];

const TOWN_PREFIX = ["Ash", "Brook", "Car", "Dun", "Elm", "Fal", "Glen", "Hal", "Iron", "Kings", "Lark", "Mar", "North", "Oak", "Port", "Red", "Stan", "Thorn", "Wex", "West", "Whit", "Black", "Stone", "Silver"];
const TOWN_SUFFIX = ["ford", "bridge", "haven", "wick", "field", "ton", "moor", "bury", "gate", "dale", "mouth", "stead", "ley", "hampton", "worth"];
const CLUB_SUFFIX = ["United", "City", "FC", "Athletic", "Rovers", "Town", "Albion", "Wanderers", "County", "Rangers"];

const KIT_COLORS = ["#d62828", "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed", "#0f172a", "#f8fafc", "#0891b2", "#be185d", "#ea580c", "#facc15", "#065f46", "#7f1d1d", "#1e3a8a"];

export function makeId(prefix: string, rng: Rng): string {
  return `${prefix}_${rng.fork().toString(36)}${rng.fork().toString(36)}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function generateTownName(rng: Rng): string {
  return rng.pick(TOWN_PREFIX) + rng.pick(TOWN_SUFFIX);
}

export function generateClubName(rng: Rng, taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const name = `${generateTownName(rng)} ${rng.pick(CLUB_SUFFIX)}`;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  return `Club ${taken.size + 1}`;
}

export function shortNameFor(name: string, taken?: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, "").split(" ").filter(Boolean);
  const town = words[0] ?? "CLB";
  const second = words[1] ?? "";
  const consonants = town.slice(1).replace(/[AEIOU]/g, "");
  const candidates = [
    town.slice(0, 3),
    town.slice(0, 2) + second.charAt(0),
    town.charAt(0) + consonants.slice(0, 2),
    town.charAt(0) + second.slice(0, 2),
    town.charAt(0) + consonants.charAt(0) + second.charAt(0),
  ].filter((c) => c.length === 3);
  if (!taken) return candidates[0] ?? town.slice(0, 3);
  const pick = candidates.find((c) => !taken.has(c)) ?? (() => {
    for (let i = 2; ; i++) if (!taken.has(town.slice(0, 2) + i)) return town.slice(0, 2) + i;
  })();
  taken.add(pick);
  return pick;
}

/** Give clubs that share a short name a distinct one (the user's club keeps its own). */
export function dedupeShortNames(clubs: Record<string, Club>) {
  const all = Object.values(clubs).sort((a, b) => Number(b.isUser) - Number(a.isUser));
  const taken = new Set<string>();
  for (const c of all) {
    if (!taken.has(c.shortName)) taken.add(c.shortName);
    else c.shortName = shortNameFor(c.name, taken);
  }
}

const CREST_SHAPES = ["shield", "classic", "round", "diamond"] as const;
const CREST_PATTERNS = ["plain", "stripes", "halves", "hoops", "sash", "chevron"] as const;

export function randomCrest(rng: Rng): CrestDesign {
  return { shape: rng.pick(CREST_SHAPES), pattern: rng.pick(CREST_PATTERNS) };
}

export function randomColors(rng: Rng): ClubColors {
  const primary = rng.pick(KIT_COLORS);
  let secondary = rng.pick(KIT_COLORS);
  while (secondary === primary) secondary = rng.pick(KIT_COLORS);
  return { primary, secondary };
}

const SECONDARY_POSITIONS: Partial<Record<Position, Position[]>> = {
  CB: ["DM"],
  LB: ["LM"],
  RB: ["RM"],
  DM: ["CM", "CB"],
  CM: ["DM", "AM"],
  AM: ["CM", "ST"],
  LM: ["LW", "LB"],
  RM: ["RW", "RB"],
  LW: ["LM", "ST"],
  RW: ["RM", "ST"],
  ST: ["AM"],
};

/**
 * Generate a player whose best-position score is around `level` (1–20 scale).
 */
/** Personality traits: mostly average, with the occasional extreme. */
export function emptySeason(): SeasonStats {
  return {
    apps: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0,
    keyPasses: 0, dribbles: 0, tackles: 0, tacklesWon: 0, interceptions: 0, fouls: 0, offsides: 0, saves: 0,
    conceded: 0, cleanSheets: 0, ratingSum: 0, distance: 0, yellows: 0, reds: 0,
  };
}

/**
 * Attributes for a player of `level` (1–20) at `pos`: what the position needs
 * sits near level, the rest lower, with realistic links between related
 * attributes (pace and acceleration, heading and jumping, and so on).
 */
export function rollAttributes(rng: Rng, pos: Position, level: number, age: number): Attributes {
  const weights = POSITION_WEIGHTS[pos];
  const isGK = pos === "GK";
  const a = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 0;
    const relevance = w >= 3 ? 1 : w >= 1 ? 0.9 : isGK ? 0.45 : 0.66;
    let v = level * relevance + rng.normal() * 1.8;
    if (GK_KEYS.has(key) && !isGK) v = rng.range(1, 4);
    a[key] = v;
  }
  const near = (base: number, spread: number) => base + rng.normal() * spread;
  // physical profile hangs together
  a.acceleration = near(a.pace, 1.6);
  a.agility = near((a.pace + a.dribbling) / 2, 2);
  a.jumping = near((a.heading + a.strength) / 2 + (isGK ? 1 : 0), 2);
  a.naturalFitness = near(10.5, 3.2);
  // technique underpins the touch-based skills
  a.technique = near((a.passing + a.dribbling + a.firstTouch) / 3, 1.6);
  if (!isGK) {
    a.penalties = near(a.finishing, 2.5);
    a.freeKicks = near((a.longShots + a.technique) / 2, 2.8);
  }
  // personality-like attributes vary widely, whatever the level
  a.flair = near(level * 0.6 + 2, 3.5);
  a.leadership = near(6 + (age - 17) * 0.35, 3);
  a.bravery = near(level * 0.75, 3);
  a.concentration = near(level * 0.8, 2.2);
  // older players lose pace; young players are raw in experience attributes
  if (age > 30) {
    a.pace -= (age - 30) * 0.5;
    a.acceleration -= (age - 30) * 0.55;
  }
  if (age < 20) {
    a.composure -= 1.5;
    a.concentration -= 1.5;
    a.leadership -= 1.5;
  }
  for (const key of ATTRIBUTE_KEYS) a[key] = clamp(Math.round(a[key] * 10) / 10, 1, 20);
  return a;
}

export function randomTraits(rng: Rng): Traits {
  const t = (mean = 10, sd = 4.5) => clamp(Math.round(mean + rng.normal() * sd), 1, 20);
  return {
    aggression: t(),
    injuryProneness: t(),
    consistency: t(),
    professionalism: t(11, 4),
    determination: t(11, 4),
    ambition: t(10, 4.5),
    pressure: t(10.5, 4),
    loyalty: t(10, 4.5),
    adaptability: t(10.5, 4),
    sportsmanship: t(11, 4),
  };
}

/** Personality for players from older saves, stable per player id. */
export function hashTraits(id: string): Omit<Traits, "aggression" | "injuryProneness" | "consistency"> {
  const h = (salt: string, mean: number, sd: number) => {
    // two uniform draws → roughly normal
    const a = (hashString(id + salt) % 1000) / 1000;
    const b = (hashString(salt + id) % 1000) / 1000;
    return clamp(Math.round(mean + (a + b - 1) * sd * 2.4), 1, 20);
  };
  return {
    professionalism: h("prof", 11, 4),
    determination: h("det", 11, 4),
    ambition: h("amb", 10, 4.5),
    pressure: h("prs", 10.5, 4),
    loyalty: h("loy", 10, 4.5),
    adaptability: h("adp", 10.5, 4),
    sportsmanship: h("spt", 11, 4),
  };
}

export function generatePlayer(
  rng: Rng,
  opts: { clubId: string; position: Position; level: number; age?: number; shirt: number; usedNames?: Set<string>; season?: number; tier?: number },
): Player {
  const pool = rng.pick(NAME_POOLS);
  let lastName = rng.pick(pool.last);
  // avoid two players with the same surname in one squad
  for (let i = 0; i < 12 && opts.usedNames?.has(lastName); i++) lastName = rng.pick(rng.pick(NAME_POOLS).last);
  opts.usedNames?.add(lastName);
  const age = opts.age ?? clamp(Math.round(25 + rng.normal() * 4.5), 17, 35);
  const attributes = rollAttributes(rng, opts.position, opts.level, age);

  const positions: Position[] = [opts.position];
  const extras = SECONDARY_POSITIONS[opts.position];
  if (extras && rng.chance(0.55)) positions.push(rng.pick(extras));

  const ability = opts.level * 10;
  // Headroom is centred so the next generation matches today's level (most
  // players reach ~92% of their ceiling); see scripts/longrun.ts.
  const growthRoom = age <= 19 ? rng.range(12, 42) : age <= 23 ? rng.range(4, 26) : age <= 27 ? rng.range(0, 12) : rng.range(0, 4);

  const traits = randomTraits(rng);
  const p: Player = {
    id: makeId("p", rng),
    clubId: opts.clubId,
    firstName: rng.pick(pool.first),
    lastName,
    nationality: pool.nat,
    age,
    positions,
    attributes,
    potential: clamp(Math.round(ability + growthRoom), Math.round(ability), 200),
    traits,
    fitness: 100,
    morale: 70,
    sharpness: 90,
    injuryWeeks: 0,
    form: [],
    season: emptySeason(),
    suspension: 0,
    shirt: opts.shirt,
    contract: { wage: 0, expires: 1 },
    status: "rotation",
    minutesHistory: [],
    unhappyWeeks: 0,
    transferRequest: false,
  };
  p.contract = newContract(p, opts.season ?? 1, opts.tier ?? 2, rng);
  p.roleExp = initialRoleExp(p);
  p.history = [];
  // he's been at the club a while already (tenure feeds dressing-room influence)
  p.joinedSeason = (opts.season ?? 1) - (hashString(p.id + "joined") % Math.max(1, Math.min(8, age - 16)));
  p.rapport = 50;
  p.settled = 100;
  return p;
}

const SQUAD_TEMPLATE: Position[] = [
  "GK", "GK", "GK",
  "CB", "CB", "CB", "CB", "LB", "LB", "RB", "RB",
  "DM", "CM", "CM", "CM", "AM",
  "LM", "RM", "LW", "RW",
  "ST", "ST", "ST",
];

const SHIRTS: Record<Position, number[]> = {
  GK: [1, 13, 31], CB: [4, 5, 15, 16], LB: [3, 23], RB: [2, 22], DM: [6], CM: [8, 14, 18], AM: [10],
  LM: [11], RM: [7], LW: [17], RW: [19], ST: [9, 20, 21],
};

/** reputation 1–100 → average squad level on the 1–20 scale */
export function levelForReputation(rep: number): number {
  return 8 + (rep / 100) * 7; // 8 (weak) → 15 (elite)
}

export function generateSquad(rng: Rng, clubId: string, reputation: number, tier = 2): Player[] {
  const base = levelForReputation(reputation);
  const used: Record<string, number> = {};
  const usedNames = new Set<string>();
  const squad = SQUAD_TEMPLATE.map((pos, i) => {
    const n = used[pos] ?? 0;
    used[pos] = n + 1;
    // first-choice players a bit better, backups and youngsters lower
    const tier = n === 0 ? 0.6 : n === 1 ? 0 : -1.2;
    const youth = i % 6 === 5;
    const shirt = SHIRTS[pos][n] ?? 24 + i;
    return generatePlayer(rng, {
      clubId,
      position: pos,
      level: clamp(base + tier + rng.normal() * 0.9 - (youth ? 2 : 0), 3, 19),
      age: youth ? rng.int(17, 19) : undefined,
      shirt,
      usedNames,
      tier,
    });
  });
  const statuses = autoStatuses(squad);
  for (const p of squad) p.status = statuses[p.id];
  return squad;
}

export function generateClub(
  rng: Rng,
  opts: { name: string; reputation: number; isUser?: boolean; colors?: ClubColors; crest?: CrestDesign; shortName?: string; formation?: FormationId; tier?: number },
): { club: Club; players: Player[] } {
  const id = makeId("c", rng);
  const players = generateSquad(rng, id, opts.reputation, opts.tier ?? 2);
  const formation: FormationId = opts.formation ?? rng.pick(["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2"] as const);
  const { lineup, bench } = autoPickLineup(players, formation);
  const club: Club = {
    id,
    name: opts.name,
    shortName: opts.shortName ?? shortNameFor(opts.name),
    colors: opts.colors ?? randomColors(rng),
    crest: opts.crest ?? randomCrest(rng),
    reputation: opts.reputation,
    balance: Math.round((2 + opts.reputation / 8) * 1_000_000),
    isUser: !!opts.isUser,
    tactics: {
      formation,
      instructions: {
        ...DEFAULT_INSTRUCTIONS,
        mentality: rng.int(2, 4),
        pressing: rng.int(2, 4),
        defensiveLine: rng.int(2, 4),
      },
      lineup,
      bench,
    },
    staff: Object.fromEntries(
      (["assistant", "coach", "scout", "physio"] as const).map((role) => [role, generateStaff(rng, role, staffLevel(opts.reputation) + rng.normal() * 2)]),
    ),
    academy: clamp(Math.round(1 + opts.reputation / 25 + rng.normal() * 0.5), 1, 5),
    facilities: { training: clamp(Math.round(1 + opts.reputation / 25 + rng.normal() * 0.5), 1, 5) },
    familiarity: initialFamiliarity(formation, DEFAULT_INSTRUCTIONS),
  };
  club.familiarity = initialFamiliarity(formation, club.tactics.instructions, opts.isUser ? 75 : rng.int(78, 92));
  for (const member of Object.values(club.staff)) if (member) appointStaff(member, club, 1, 1);
  if (!opts.isUser) {
    club.manager = generateManager(rng, opts.reputation, 1, formation);
    // he has drilled his other formations too, a little less
    club.manager.formations.slice(1).forEach((f, i) => (club.familiarity.formation[f] = Math.max(club.familiarity.formation[f] ?? 0, 70 - i * 10)));
  }
  club.tactics.roles = autoRoles(new Map(players.map((p) => [p.id, p])), formation, lineup);
  return { club, players };
}

export interface GeneratedWorld {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  /** Divisions, top tier first. */
  leagues: League[];
  userClubId: string;
}

export interface WorldOptions {
  leagueSize?: number;
  /** Number of divisions in the pyramid (1–2). */
  divisions?: number;
  /** Which tier the user's club starts in (1 = top). */
  userTier?: number;
}

const TIER_NAMES = ["Premier Division", "First Division", "Second Division"];
/** Reputation band per tier when there is a pyramid, [low, high]. */
const TIER_REP: [number, number][] = [
  [50, 82],
  [26, 56],
  [15, 40],
];

export function generateWorld(
  seed: number,
  user: { name: string; shortName: string; colors: ClubColors; crest?: CrestDesign; formation: FormationId },
  opts: WorldOptions = {},
): GeneratedWorld {
  const leagueSize = opts.leagueSize ?? 12;
  const divisions = Math.max(1, Math.min(3, opts.divisions ?? 1));
  const userTier = Math.max(1, Math.min(divisions, opts.userTier ?? 1));
  const rng = new Rng(seed);
  const taken = new Set<string>([user.name]);
  const takenShort = new Set<string>([user.shortName]);
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const county = generateTownName(rng);

  const add = (g: { club: Club; players: Player[] }) => {
    clubs[g.club.id] = g.club;
    for (const p of g.players) players[p.id] = p;
    return g.club.id;
  };

  const leagues: League[] = [];
  let userClubId = "";
  for (let tier = 1; tier <= divisions; tier++) {
    // A single division keeps a wide spread; a pyramid uses tier bands.
    const [lo, hi] = divisions === 1 ? [32, 72] : TIER_REP[tier - 1];
    const ids: string[] = [];
    const userHere = tier === userTier;
    if (userHere) {
      // The user's club sits around mid-table for its tier.
      userClubId = add(
        generateClub(rng, {
          name: user.name,
          shortName: user.shortName,
          colors: user.colors,
          reputation: divisions === 1 ? 50 : Math.round(lo + (hi - lo) * 0.45),
          isUser: true,
          formation: user.formation,
          crest: user.crest,
          tier,
        }),
      );
      ids.push(userClubId);
    }
    const aiCount = leagueSize - (userHere ? 1 : 0);
    for (let i = 0; i < aiCount; i++) {
      const rep = clamp(Math.round(lo + (i / Math.max(1, aiCount - 1)) * (hi - lo) + rng.normal() * 4), 10, 90);
      const name = generateClubName(rng, taken);
      ids.push(add(generateClub(rng, { name, shortName: shortNameFor(name, takenShort), reputation: rep, tier })));
    }
    const clubIds = rng.shuffle(ids);
    // local rivalries: pair clubs up within the division
    for (let i = 0; i + 1 < clubIds.length; i += 2) {
      clubs[clubIds[i]].rivalId = clubIds[i + 1];
      clubs[clubIds[i + 1]].rivalId = clubIds[i];
    }
    leagues.push({
      id: makeId("l", rng),
      tier,
      name: `${county}shire ${TIER_NAMES[tier - 1]}`,
      season: 1,
      clubIds,
      fixtures: roundRobin(clubIds, rng, true),
      currentRound: 0,
    });
  }

  return { clubs, players, leagues, userClubId };
}
