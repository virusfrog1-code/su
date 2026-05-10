"use client";

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { useI18n, type Locale } from "@/lib/i18n";

const navItems = [
  { href: "/mint", labelKey: "nav.mint" },
  { href: "/leaderboard", labelKey: "nav.leaderboard" },
  { href: "/activity", labelKey: "nav.activity" },
  { href: "/admin", labelKey: "nav.admin" }
] as const;

export function Header() {
  const { t, setLocale, locale } = useI18n();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-void/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-signal shadow-glow" />
          <span className="text-sm font-black tracking-[0.35em] text-white">SUMMON</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-silver/78 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-white">
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            title={t("lang.label")}
            aria-label={t("lang.label")}
            className="rounded-md border border-white/15 bg-void px-3 py-2 text-xs font-bold text-silver outline-none transition hover:border-signal hover:text-signal"
          >
            <option value="en">{t("lang.en")}</option>
            <option value="zh">{t("lang.zh")}</option>
            <option value="ko">{t("lang.ko")}</option>
            <option value="ja">{t("lang.ja")}</option>
          </select>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
