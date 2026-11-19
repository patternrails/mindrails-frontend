"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/use-i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-medium tracking-tight">{t("notFound.title")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {t("notFound.description")}
      </p>
      <Link
        href="/"
        className="mt-6 w-fit rounded-md border border-border px-4 py-2 text-sm hover:bg-surface"
      >
        {t("notFound.goHome")}
      </Link>
    </main>
  );
}
