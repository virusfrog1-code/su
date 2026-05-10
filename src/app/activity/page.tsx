"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { compactHash, formatDate, shortAddress } from "@/lib/utils";

type Row = {
  walletAddress: string;
  tweetUrl: string;
  tweetId: string;
  score: number;
  amount: string;
  txHash?: string | null;
  isMock?: boolean;
  createdAt: string;
};

export default function ActivityPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/activity")
      .then((response) => response.json())
      .then((data) => setRows(data.rows || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-signal">
          {t("activity.eyebrow")}
        </p>
        <h1 className="mt-3 text-4xl font-black text-white sm:text-6xl">{t("activity.title")}</h1>
      </div>

      <div className="terminal-panel rounded-lg p-4">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-silver/62">{t("activity.empty")}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <a
                key={row.tweetId}
                href={row.tweetUrl || `https://x.com/i/web/status/${row.tweetId}`}
                target="_blank"
                rel="noreferrer"
                className="grid gap-3 rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-silver/78 transition hover:border-plasma/45 md:grid-cols-[1fr_0.7fr_0.7fr_1fr]"
              >
                <span className="font-mono text-white">{shortAddress(row.walletAddress)}</span>
                <span>{t("activity.score")} {row.score}</span>
                <span>{Number(row.amount).toLocaleString()} SUMMON</span>
                <span>
                  {compactHash(row.txHash)} / {row.isMock ? t("common.mock") : t("common.real")} / {formatDate(row.createdAt)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
