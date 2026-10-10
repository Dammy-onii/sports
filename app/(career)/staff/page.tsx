import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { StaffScreen } from "@/components/screens/StaffScreen";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return (
    <RequireCareer>
      <StaffScreen />
    </RequireCareer>
  );
}
