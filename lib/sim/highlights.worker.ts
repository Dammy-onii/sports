/// <reference lib="webworker" />
import { highlightWindows } from "@/game/highlights";
import type { MatchState } from "@/game/engine/types";

self.onmessage = (event: MessageEvent<{ id: number; state: MatchState }>) => {
  const { id, state } = event.data;
  try { self.postMessage({ id, windows: highlightWindows(state) }); }
  catch { self.postMessage({ id, windows: null }); }
};
