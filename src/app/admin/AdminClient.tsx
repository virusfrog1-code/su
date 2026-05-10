"use client";

import { useState } from "react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, shortAddress } from "@/lib/utils";

type Verification = {
  id: string;
  walletAddress: string;
  tweetId: string;
  valid: boolean;
  reason?: string | null;
  score?: number | null;
  mintMultiplier?: number | null;
  createdAt: string;
};

type Stats = {
  totalMintCount: number;
  totalMintAmount: number;
  totalUsers: number;
  recentVerifications: Verification[];
  config: {
    baseMintAmount: number;
    dailyWalletMintLimit: number;
    mintPaused: boolean;
    requiredHashtag: string;
    requiredPhrase: string;
  };
};

const configFields = [
  { key: "baseMintAmount", labelKey: "admin.baseMintAmount" },
  { key: "dailyWalletMintLimit", labelKey: "admin.dailyWalletMintLimit" },
  { key: "requiredHashtag", labelKey: "admin.requiredHashtag" },
  { key: "requiredPhrase", labelKey: "admin.requiredPhrase" }
] satisfies Array<{ key: string; labelKey: TranslationKey }>;

export function AdminClient() {
  const { t } = useI18n();
  const [adminKey, setAdminKey] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadStats() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/stats", {
        headers: { "X-Admin-Key": adminKey }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load admin stats");
      setStats(payload);
      setForm({
        baseMintAmount: String(payload.config.baseMintAmount),
        dailyWalletMintLimit: String(payload.config.dailyWalletMintLimit),
        requiredHashtag: payload.config.requiredHashtag,
        requiredPhrase: payload.config.requiredPhrase
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load admin stats");
    } finally {
      setBusy(false);
    }
  }

  async function updateConfig(key: string, value: string) {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey
        },
        body: JSON.stringify({ key, value })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update config");
      await loadStats();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update config");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="terminal-panel rounded-lg p-5">
        <h2 className="text-xl font-bold text-white">{t("admin.access")}</h2>
        <input
          value={adminKey}
          onChange={(event) => setAdminKey(event.target.value)}
          placeholder="ADMIN_KEY"
          type="password"
          className="mt-4 min-h-12 w-full rounded-md border border-white/10 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-silver/36 focus:border-signal"
        />
        <button
          type="button"
          onClick={loadStats}
          disabled={!adminKey || busy}
          className="mt-4 rounded-md bg-signal px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t("admin.loading") : t("admin.load")}
        </button>

        {stats ? (
          <div className="mt-6 grid gap-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-silver/48">{t("admin.totalMints")}</p>
              <p className="mt-2 text-2xl font-black text-white">{stats.totalMintCount}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-silver/48">{t("admin.totalUsers")}</p>
              <p className="mt-2 text-2xl font-black text-white">{stats.totalUsers}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-silver/48">{t("admin.totalAmount")}</p>
              <p className="mt-2 text-2xl font-black text-white">
                {stats.totalMintAmount.toLocaleString()}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="terminal-panel rounded-lg p-5">
        <h2 className="text-xl font-bold text-white">{t("admin.controls")}</h2>
        {stats ? (
          <div className="mt-5 grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div>
                <p className="font-semibold text-white">
                  {stats.config.mintPaused ? t("admin.mintPaused") : t("admin.mintActive")}
                </p>
                <p className="mt-1 text-sm text-silver/58">{t("admin.pauseDesc")}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  updateConfig("mintPaused", stats.config.mintPaused ? "false" : "true")
                }
                className="rounded-md border border-signal/45 px-4 py-3 text-sm font-bold text-signal transition hover:bg-signal hover:text-black disabled:opacity-50"
              >
                {stats.config.mintPaused ? t("admin.resume") : t("admin.pause")}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {configFields.map((field) => (
                <label key={field.key} className="block rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <span className="text-sm font-semibold text-white">{t(field.labelKey)}</span>
                  <input
                    value={form[field.key] || ""}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="mt-3 min-h-11 w-full rounded-md border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-signal"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => updateConfig(field.key, form[field.key] || "")}
                    className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-bold text-black transition hover:bg-signal disabled:opacity-50"
                  >
                    {t("admin.save")}
                  </button>
                </label>
              ))}
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">{t("admin.recentVerifications")}</h3>
              <div className="mt-3 space-y-3">
                {stats.recentVerifications.map((item) => (
                  <div key={item.id} className="rounded-md border border-white/10 bg-black/25 p-4 text-sm text-silver/72">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-white">{shortAddress(item.walletAddress)}</span>
                      <span className={item.valid ? "text-signal" : "text-red-300"}>
                        {item.valid ? t("admin.valid") : t("admin.failed")}
                      </span>
                    </div>
                    <p className="mt-2">
                      {t("admin.tweet")} {item.tweetId.slice(-8)} / {t("admin.score")} {item.score ?? t("common.notAvailable")} /{" "}
                      {formatDate(item.createdAt)}
                    </p>
                    <p className="mt-1 text-silver/50">{item.reason || t("admin.noReason")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-silver/62">{t("admin.enterKey")}</p>
        )}

        {error ? (
          <div className="mt-5 rounded-md border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>
    </div>
  );
}
