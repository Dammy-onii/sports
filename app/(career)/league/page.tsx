import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { LeagueScreen } from "@/components/screens/LeagueScreen";

export const metadata: Metadata = { title: "League" };

export default function Page() {
  return (
    <RequireCareer>
      <LeagueScreen />
    </RequireCareer>
  );
}
