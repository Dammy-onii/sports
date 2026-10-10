/// <reference lib="webworker" />
// Runs heavy, pure game steps (whole matchdays, season rollover) off the UI thread.
import { completeRound, startNextSeason } from "@/game/career";
import type { SimRequest, SimResponse } from "./protocol";

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const req = e.data;
  try {
    const save = req.type === "completeRound" ? completeRound(req.save, req.userMatch, req.opts) : startNextSeason(req.save);
    const res: SimResponse = { id: req.id, ok: true, save };
    self.postMessage(res);
  } catch (err) {
    const res: SimResponse = { id: req.id, ok: false, error: String(err) };
    self.postMessage(res);
  }
};
