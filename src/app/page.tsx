"use client";

import Link from "next/link";
import { RecentSummons } from "@/components/RecentSummons";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useI18n();
  const steps = [t("home.step1"), t("home.step2"), t("home.step3")];
  const tokenomics = [
    { label: t("home.token"), value: "$SUMMON" },
    { label: t("home.baseMint"), value: "1,000,000" },
    { label: t("home.multiplier"), value: "1.0x to 3.0x" },
    { label: t("home.proof"), value: "Tweet ID" }
  ];

  return (
    <main>
      <section className="mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.35em] text-signal">
            {t("home.eyebrow")}
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.96] text-white sm:text-7xl lg:text-8xl">
            SUMMON GROK.
            <br />
            POST TO MINT.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-silver/76">
            {t("home.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/mint"
              className="rounded-md bg-signal px-5 py-3 text-sm font-bold text-black shadow-glow transition hover:bg-white"
            >
              {t("home.start")}
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-md border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-plasma hover:text-plasma"
            >
              {t("home.leaderboard")}
            </Link>
            <a
              href="#how-it-works"
              className="rounded-md border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-signal hover:text-signal"
            >
              {t("home.how")}
            </a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <div className="ritual-ring w-full" />
          <div className="terminal-panel absolute inset-x-8 bottom-8 rounded-lg p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-plasma">{t("home.agent")}</p>
            <p className="mt-3 font-mono text-sm text-silver/80">
              {t("home.agentLine")}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3 lg:px-8">
        {steps.map((step, index) => (
          <div key={step} className="terminal-panel rounded-lg p-5">
            <span className="text-xs font-bold text-signal">0{index + 1}</span>
            <h2 className="mt-3 text-xl font-semibold text-white">{step}</h2>
          </div>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="terminal-panel rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white">{t("home.tokenomics")}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {tokenomics.map((item) => (
              <div key={item.label} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-silver/50">{item.label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="how-it-works" className="terminal-panel rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white">{t("home.howTitle")}</h2>
          <div className="mt-6 space-y-4 text-sm leading-7 text-silver/74">
            <p>{t("home.howP1")}</p>
            <p>{t("home.howP2")}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <RecentSummons />
      </section>
    </main>
  );
}
