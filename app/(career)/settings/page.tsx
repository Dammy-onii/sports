import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { SettingsScreen } from "@/components/screens/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <RequireCareer>
      <SettingsScreen />
    </RequireCareer>
  );
}
