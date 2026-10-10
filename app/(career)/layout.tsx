import type { ReactNode } from "react";
import { CareerShell } from "@/components/CareerShell";

export default function CareerLayout({ children }: { children: ReactNode }) {
  return <CareerShell>{children}</CareerShell>;
}
