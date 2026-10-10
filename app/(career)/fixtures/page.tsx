import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { FixturesScreen } from "@/components/screens/FixturesScreen";

export const metadata: Metadata = { title: "Fixtures & results" };

export default function Page() {
  return (
    <RequireCareer>
      <FixturesScreen />
    </RequireCareer>
  );
}
