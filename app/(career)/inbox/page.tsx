import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { InboxScreen } from "@/components/screens/InboxScreen";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <RequireCareer>
      <InboxScreen />
    </RequireCareer>
  );
}
