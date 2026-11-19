import type { ReactNode } from "react";
import { AuthGate } from "@/providers/auth-provider";
import "./files.css";

export default function FilesLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
