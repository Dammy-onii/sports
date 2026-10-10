import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { TacticsScreen } from "@/components/screens/TacticsScreen";

export const metadata: Metadata = { title: "Tactics" };

export default function Page() {
  return (
    <RequireCareer>
      <TacticsScreen />
    </RequireCareer>
  );
}
