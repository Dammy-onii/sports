import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { ClubScreen } from "@/components/screens/ClubScreen";

export const metadata: Metadata = { title: "Club" };

export default function Page() {
  return (
    <RequireCareer>
      <ClubScreen />
    </RequireCareer>
  );
}
