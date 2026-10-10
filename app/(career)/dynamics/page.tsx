import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { DynamicsScreen } from "@/components/screens/DynamicsScreen";

export const metadata: Metadata = { title: "Dynamics" };

export default function Page() {
  return (
    <RequireCareer>
      <DynamicsScreen />
    </RequireCareer>
  );
}
