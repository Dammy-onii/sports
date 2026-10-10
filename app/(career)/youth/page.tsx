import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { YouthScreen } from "@/components/screens/YouthScreen";

export const metadata: Metadata = { title: "Academy" };

export default function Page() {
  return (
    <RequireCareer>
      <YouthScreen />
    </RequireCareer>
  );
}
