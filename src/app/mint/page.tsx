"use client";

import { MintClient } from "@/app/mint/MintClient";
import { useI18n } from "@/lib/i18n";

export default function MintPage() {
  const { t } = useI18n();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-signal">
          {t("mint.eyebrow")}
        </p>
        <h1 className="mt-3 max-w-5xl text-2xl font-black leading-tight text-white sm:text-4xl">
          {t("mint.title")}
        </h1>
      </div>
      <MintClient />
    </main>
  );
}
