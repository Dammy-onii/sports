import type { MatchState } from "@/game/engine/types";
import type { RoundOptions } from "@/game/career";
import type { SaveGame } from "@/game/save";

export type SimRequest =
  | { id: number; type: "completeRound"; save: SaveGame; userMatch?: MatchState; opts?: RoundOptions }
  | { id: number; type: "startNextSeason"; save: SaveGame };

export type SimResponse = { id: number; ok: true; save: SaveGame } | { id: number; ok: false; error: string };
