import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { TransfersScreen } from "@/components/screens/TransfersScreen";

export const metadata: Metadata = { title: "Transfers" };

export default function Page() {
  return (
    <RequireCareer>
      <TransfersScreen />
    </RequireCareer>
  );
}
