import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { PlayerScreen } from "@/components/screens/PlayerScreen";

export const metadata: Metadata = { title: "Player" };

export default function Page() {
  return (
    <RequireCareer>
      <PlayerScreen />
    </RequireCareer>
  );
}
