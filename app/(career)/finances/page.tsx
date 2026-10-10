import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { FinancesScreen } from "@/components/screens/FinancesScreen";

export const metadata: Metadata = { title: "Finances" };

export default function Page() {
  return (
    <RequireCareer>
      <FinancesScreen />
    </RequireCareer>
  );
}
