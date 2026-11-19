import { FutureModule } from "@/components/shell/future-module";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { tab } = await searchParams;
  const initialTab = tab === "providers" ? "providers" : "general";
  return <FutureModule key={initialTab} module="settings" initialTab={initialTab} />;
}
