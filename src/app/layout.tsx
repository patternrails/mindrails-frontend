import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { BackendConnectionProvider } from "@/providers/backend-connection-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { UiPreferencesProvider } from "@/providers/ui-preferences-provider";

export const metadata: Metadata = {
  title: "MindRails",
  description: "A workspace for agents, knowledge and tools.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><BackendConnectionProvider><UiPreferencesProvider><AuthProvider>{children}</AuthProvider></UiPreferencesProvider></BackendConnectionProvider></body>
    </html>
  );
}
