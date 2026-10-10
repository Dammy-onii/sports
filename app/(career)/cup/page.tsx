import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { CupScreen } from "@/components/screens/CupScreen";

export const metadata: Metadata = { title: "Cup" };

export default function Page() {
  return (
    <RequireCareer>
      <CupScreen />
    </RequireCareer>
  );
}
