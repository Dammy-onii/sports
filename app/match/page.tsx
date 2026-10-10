import type { Metadata } from "next";
import { MatchScreen } from "@/components/screens/MatchScreen";

export const metadata: Metadata = { title: "Match day" };

export default function MatchPage() {
  return <MatchScreen />;
}
