import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { AnalyticsScreen } from "@/components/screens/AnalyticsScreen";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <RequireCareer>
      <AnalyticsScreen />
    </RequireCareer>
  );
}
