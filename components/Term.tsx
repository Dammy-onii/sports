"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";

/** Plain explanations of the numbers the game shows. One place, used everywhere. */
export const GLOSSARY = {
  ovr: {
    title: "OVR (overall)",
    text: "How good a player is in a position, from 1 to 99. It's the average of the attributes that matter for that position (each out of 20), so a centre-back's OVR leans on tackling, marking and heading, a winger's on pace, dribbling and crossing. Playing out of position lowers it. 50s is a squad player at this level, 60s a regular, 70s a star.",
  },
  rating: {
    title: "Match rating",
    text: "How well a player is doing in this match, out of 10. Everyone starts at about 6.3 and goes up with goals, assists, key passes, tackles, saves and accurate passing, and down with lost balls, fouls, cards and goals conceded. 6.0 is ordinary, 7.0 good, 8.0+ outstanding.",
  },
  potential: {
    title: "Potential",
    text: "How good a player could become, shown in stars. For your players it's your coaches' estimate; for others it's your scouts', so it can be wrong. Young players need minutes, good training and good coaches to reach it.",
  },
  fitness: {
    title: "Fitness / energy",
    text: "How fresh a player is (0–100%). Matches drain it; rest and recovery training bring it back. Tired players are slower, make more mistakes and get injured more.",
  },
  morale: {
    title: "Morale",
    text: "How happy a player is (0–100). Results, playing time, how you talk to him and promises kept all move it. Happy players perform slightly better.",
  },
  sharpness: {
    title: "Sharpness",
    text: "Match rhythm (0–100), separate from fitness. It drops when a player isn't playing and comes back with minutes and friendlies. Rusty players are a little worse on the ball.",
  },
  form: {
    title: "Form",
    text: "The average of a player's last five match ratings.",
  },
  xg: {
    title: "xG (expected goals)",
    text: "How likely a chance was to go in, from 0 to 1. Add up a team's chances and you get how many goals they 'should' have scored. Scoring more than your xG can be good finishing or luck.",
  },
  familiarity: {
    title: "Familiarity",
    text: "How well the team knows its formation and instructions. It grows with matches and tactical training and fades when unused. Low familiarity means worse positioning and pressing.",
  },
  cohesion: {
    title: "Cohesion",
    text: "How well the squad knows each other (0–100). It grows with a settled squad and drops when lots of players come and go. It helps short passing and link-up play.",
  },
  rapport: {
    title: "Rapport",
    text: "A player's relationship with you (0–100). Built by good conversations, keeping promises and fair playing time. Players with good rapport take your words better.",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;

/**
 * A game term with a dashed underline. Hover or tap it for a one-paragraph
 * explanation. Children default to the term's short name.
 */
export function Term({ k, children, className }: { k: TermKey; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const g = GLOSSARY[k];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn("relative inline-block", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="cursor-help border-b border-dashed border-current leading-tight"
      >
        {children ?? g.title}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 block w-64 -translate-x-1/2 rounded-md bg-text px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-surface shadow-lg"
        >
          <span className="mb-0.5 block font-semibold">{g.title}</span>
          {g.text}
        </span>
      )}
    </span>
  );
}
