import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { TrainingScreen } from "@/components/screens/TrainingScreen";

export const metadata: Metadata = { title: "Training" };

export default function Page() {
  return (
    <RequireCareer>
      <TrainingScreen />
    </RequireCareer>
  );
}
