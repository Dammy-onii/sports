import type { Metadata } from "next";
import { RequireCareer } from "@/components/CareerShell";
import { EditorScreen } from "@/components/screens/EditorScreen";

export const metadata: Metadata = { title: "Editor" };

export default function Page() {
  return (
    <RequireCareer>
      <EditorScreen />
    </RequireCareer>
  );
}
