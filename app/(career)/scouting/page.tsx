import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { ScoutingScreen } from "@/components/screens/ScoutingScreen";

export const metadata: Metadata = { title: "Scouting" };

export default function Page() {
  return (
    <RequireCareer>
      <ScoutingScreen />
    </RequireCareer>
  );
}
