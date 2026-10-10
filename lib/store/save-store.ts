"use client";

import { useEffect, useSyncExternalStore } from "react";
import { currentSeason, userLeague } from "@/game/career";
import { migrateSave } from "@/game/migrate";
import type { SaveGame } from "@/game/save";
import type { ClubColors, CrestDesign } from "@/game/types";

/**
 * Local persistence: several career slots in localStorage.
 *   touchline.slots.v1      → index { active, slots[] }
 *   touchline.save.<id>     → one SaveGame per slot
 * The pre-slots key (touchline.career.v1) is moved into a slot on first load.
 */
const INDEX_KEY = "touchline.slots.v1";
const LEGACY_KEY = "touchline.career.v1";
const saveKey = (id: string) => `touchline.save.${id}`;
export const MAX_SLOTS = 5;

export interface SlotMeta {
  id: string;
  clubName: string;
  shortName: string;
  colors: ClubColors;
  crest?: CrestDesign;
  managerName: string;
  season: number;
  leagueName: string;
  updatedAt: number;
}

export interface SlotIndex {
  active: string | null;
  slots: SlotMeta[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let index: SlotIndex | undefined;
let active: SaveGame | null = null;
let lastError: string | null = null;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    lastError = null;
    return true;
  } catch {
    // quota exceeded or storage blocked: keep playing from memory
    lastError = "Couldn't save to this device's storage (it may be full). Export your career to keep it safe.";
    return false;
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function metaFor(save: SaveGame): SlotMeta {
  const club = save.clubs[save.userClubId];
  return {
    id: save.id,
    clubName: club.name,
    shortName: club.shortName,
    colors: club.colors,
    crest: club.crest,
    managerName: save.managerName,
    season: currentSeason(save),
    leagueName: userLeague(save).name,
    updatedAt: save.updatedAt,
  };
}

function loadSave(id: string): SaveGame | null {
  const raw = read(saveKey(id)) as { version?: number } | null;
  if (!raw) return null;
  // migrations are cheap and idempotent, so run them on every load (they also apply small repairs)
  return migrateSave(raw);
}

function ensureLoaded() {
  if (index !== undefined) return;
  index = (read(INDEX_KEY) as SlotIndex | null) ?? { active: null, slots: [] };
  // one-time move of the single pre-slots career
  const legacy = read(LEGACY_KEY);
  if (legacy) {
    const save = migrateSave(legacy);
    if (save && !index.slots.some((s) => s.id === save.id)) {
      write(saveKey(save.id), save);
      index = { active: save.id, slots: [metaFor(save), ...index.slots] };
      write(INDEX_KEY, index);
    }
    remove(LEGACY_KEY);
  }
  active = index.active ? loadSave(index.active) : null;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === INDEX_KEY || e.key?.startsWith("touchline.save.")) {
      index = undefined;
      ensureLoaded();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

function setIndex(next: SlotIndex) {
  index = next;
  write(INDEX_KEY, next);
}

/** Persist the active career (creating its slot if new). `null` just closes it. */
export function setSave(save: SaveGame | null) {
  ensureLoaded();
  if (!save) {
    active = null;
    setIndex({ ...index!, active: null });
    emit();
    return;
  }
  active = save;
  write(saveKey(save.id), save);
  const slots = index!.slots.some((s) => s.id === save.id)
    ? index!.slots.map((s) => (s.id === save.id ? metaFor(save) : s))
    : [metaFor(save), ...index!.slots];
  setIndex({ active: save.id, slots });
  emit();
}

/** Apply a change to a deep copy of the active save and persist it. */
export function updateSave(fn: (draft: SaveGame) => void) {
  ensureLoaded();
  if (!active) return;
  const draft = structuredClone(active);
  fn(draft);
  draft.updatedAt = Date.now();
  setSave(draft);
}

export function activateSlot(id: string) {
  ensureLoaded();
  const save = loadSave(id);
  if (!save) return;
  active = save;
  setIndex({ ...index!, active: id });
  emit();
}

export function deleteSlot(id: string) {
  ensureLoaded();
  remove(saveKey(id));
  const wasActive = index!.active === id;
  setIndex({ active: wasActive ? null : index!.active, slots: index!.slots.filter((s) => s.id !== id) });
  if (wasActive) active = null;
  emit();
}

export function canCreateSlot() {
  ensureLoaded();
  return index!.slots.length < MAX_SLOTS;
}

/** Serialise a slot for download. */
export function exportSlot(id: string): { filename: string; json: string } | null {
  ensureLoaded();
  const save = id === active?.id ? active : loadSave(id);
  if (!save) return null;
  const club = save.clubs[save.userClubId].name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { filename: `touchline-${club}-season-${currentSeason(save)}.json`, json: JSON.stringify(save) };
}

/** Load a save file into a new slot and make it active. Returns an error message on failure. */
export function importSave(text: string): string | null {
  ensureLoaded();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "That file isn't a valid save.";
  }
  const save = migrateSave(parsed);
  if (!save || !save.clubs || !save.players || !save.leagues?.length) {
    return "That file isn't a Touchline save (or it's from a newer version).";
  }
  if (!canCreateSlot()) return `You already have ${MAX_SLOTS} careers. Delete one first.`;
  if (index!.slots.some((s) => s.id === save.id)) save.id = `${save.id}_${Date.now().toString(36)}`;
  setSave(save);
  return null;
}

export function storageError() {
  return lastError;
}

function getSave() {
  ensureLoaded();
  return active;
}
function getIndex() {
  ensureLoaded();
  return index!;
}
const serverUndefined = () => undefined;

/**
 * `undefined` while hydrating (server / first client render), `null` when no
 * career is open, otherwise the active save.
 */
export function useSave(): SaveGame | null | undefined {
  return useSyncExternalStore(subscribe, getSave, serverUndefined);
}

export function useSlots(): SlotIndex | undefined {
  return useSyncExternalStore(subscribe, getIndex, serverUndefined);
}

/** For screens rendered inside <RequireCareer>, which guarantees a save exists. */
export function useCareer(): SaveGame {
  const save = useSave();
  if (!save) throw new Error("useCareer must be used inside RequireCareer");
  return save;
}

/** Run a game action on a draft of the active save, persist it, and return the action's result. */
export function act<T>(fn: (draft: SaveGame) => T): T {
  let out!: T;
  updateSave((d) => {
    out = fn(d);
  });
  return out;
}

type OnboardingKey = "tactics" | "training" | "match" | "scouting" | "transfers";

/** Tick off a first-season checklist item when a screen is visited. */
export function useOnboarding(key: OnboardingKey) {
  const save = useSave();
  const done = save?.onboarding?.[key] ?? true;
  useEffect(() => {
    if (!done) updateSave((d) => void (d.onboarding[key] = true));
  }, [done, key]);
}
