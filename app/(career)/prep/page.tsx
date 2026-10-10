import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { PrepScreen } from "@/components/screens/PrepScreen";

export const metadata: Metadata = { title: "Match preparation" };

export default function Page() {
  return (
    <RequireCareer>
      <PrepScreen />
    </RequireCareer>
  );
}
