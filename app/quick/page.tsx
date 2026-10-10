import type { Metadata } from "next";
import { QuickMatchScreen } from "@/components/screens/QuickMatchScreen";

export const metadata: Metadata = { title: "Quick match" };

export default function QuickPage() {
  return <QuickMatchScreen />;
}
