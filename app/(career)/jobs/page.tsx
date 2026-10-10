import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { JobsScreen } from "@/components/screens/JobsScreen";

export const metadata: Metadata = { title: "Job offers" };

export default function Page() {
  return (
    <RequireCareer>
      <JobsScreen />
    </RequireCareer>
  );
}
