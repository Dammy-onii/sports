import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { MediaScreen } from "@/components/screens/MediaScreen";

export const metadata: Metadata = { title: "Media" };

export default function Page() {
  return (
    <RequireCareer>
      <MediaScreen />
    </RequireCareer>
  );
}
