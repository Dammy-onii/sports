import type { Metadata } from "next";
import { LocalScreen } from "@/components/screens/LocalScreen";

export const metadata: Metadata = { title: "Head-to-head" };

export default function LocalPage() {
  return <LocalScreen />;
}
