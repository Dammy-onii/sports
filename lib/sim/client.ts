"use client";

import { completeRound as completeRoundSync, startNextSeason as startNextSeasonSync } from "@/game/career";
import type { RoundOptions } from "@/game/career";
import type { MatchState } from "@/game/engine/types";
import type { SaveGame } from "@/game/save";
import type { SimRequest, SimResponse } from "./protocol";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (s: SaveGame) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.save);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // fall back to the main thread for anything still waiting
      worker?.terminate();
      worker = null;
      for (const [, p] of pending) p.reject(new Error("worker failed"));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function run(req: DistributiveOmit<SimRequest, "id">, fallback: () => SaveGame): Promise<SaveGame> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(fallback);
  const id = nextId++;
  return new Promise<SaveGame>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as SimRequest);
  }).catch(() => fallback());
}

/** Finish the current matchday in a Web Worker (main-thread fallback). */
export function completeRoundAsync(save: SaveGame, userMatch?: MatchState, opts?: RoundOptions) {
  return run({ type: "completeRound", save, userMatch, opts }, () => completeRoundSync(save, userMatch, opts));
}

export function startNextSeasonAsync(save: SaveGame) {
  return run({ type: "startNextSeason", save }, () => startNextSeasonSync(save));
}
