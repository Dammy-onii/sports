import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { SquadScreen } from "@/components/screens/SquadScreen";

export const metadata: Metadata = { title: "Squad" };

export default function Page() {
  return (
    <RequireCareer>
      <SquadScreen />
    </RequireCareer>
  );
}
