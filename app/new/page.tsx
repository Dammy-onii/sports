import type { Metadata } from "next";
import { NewCareerScreen } from "@/components/screens/NewCareerScreen";

export const metadata: Metadata = { title: "New career" };

export default function NewCareerPage() {
  return <NewCareerScreen />;
}
