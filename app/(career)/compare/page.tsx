import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { CompareScreen } from "@/components/screens/CompareScreen";

export const metadata: Metadata = { title: "Compare players" };

export default function Page() {
  return (
    <RequireCareer>
      <CompareScreen />
    </RequireCareer>
  );
}
