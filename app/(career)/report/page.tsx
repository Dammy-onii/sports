import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { ReportScreen } from "@/components/screens/ReportScreen";

export const metadata: Metadata = { title: "Match report" };

export default function Page() {
  return (
    <RequireCareer>
      <ReportScreen />
    </RequireCareer>
  );
}
