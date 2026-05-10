"use client";

import { AdminClient } from "@/app/admin/AdminClient";
import { useI18n } from "@/lib/i18n";

export default function AdminPage() {
  const { t } = useI18n();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-signal">
          {t("admin.eyebrow")}
        </p>
        <h1 className="mt-3 text-4xl font-black text-white sm:text-6xl">{t("admin.title")}</h1>
      </div>
      <AdminClient />
    </main>
  );
}

