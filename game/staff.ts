import type { Club, StaffMember } from "./types";

/** Record a real appointment, preserving earlier jobs when someone is rehired. */
export function appointStaff(member: StaffMember, club: Pick<Club, "id" | "name">, season: number, week: number) {
  member.history ??= [];
  const current = member.history.at(-1);
  if (current && current.toSeason === undefined && current.clubId === club.id) return;
  if (current && current.toSeason === undefined) endStaffAppointment(member, season, week);
  member.history.push({ clubId: club.id, clubName: club.name, role: member.role, fromSeason: season, fromWeek: week });
}

export function endStaffAppointment(member: StaffMember, season: number, week: number) {
  const current = member.history?.at(-1);
  if (!current || current.toSeason !== undefined) return;
  current.toSeason = season;
  current.toWeek = week;
}
