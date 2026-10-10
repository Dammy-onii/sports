import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { ManagerScreen } from "@/components/screens/ManagerScreen";

export const metadata: Metadata = { title: "Manager" };

export default function Page() {
  return (
    <RequireCareer>
      <ManagerScreen />
    </RequireCareer>
  );
}
