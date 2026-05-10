"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { formatDate, shortAddress } from "@/lib/utils";

type Row = {
  walletAddress: string;
  tweetId: string;
  score: number;
  mintAmount: number;
  summonCount: number;
  hasMock?: boolean;
  hasReal?: boolean;
  createdAt: string;
};

export default function LeaderboardPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((response) => response.json())
      .then((data) => setRows(data.rows || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-signal">
            {t("leaderboard.eyebrow")}
          </p>
          <h1 className="mt-3 text-4xl font-black text-white sm:text-6xl">
            {t("leaderboard.title")}
          </h1>
        </div>
      </div>

      <div className="terminal-panel overflow-hidden rounded-lg">
        <div className="grid grid-cols-6 gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-silver/48">
          <span>{t("leaderboard.rank")}</span>
          <span>{t("leaderboard.wallet")}</span>
          <span>{t("leaderboard.tweet")}</span>
          <span>{t("leaderboard.score")}</span>
          <span>{t("leaderboard.amount")}</span>
          <span>{t("leaderboard.summons")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-silver/62">{t("leaderboard.empty")}</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.walletAddress}-${row.tweetId}`}
              className="grid grid-cols-6 gap-3 border-b border-white/5 px-4 py-4 text-sm text-silver/78 last:border-0"
            >
              <span className="font-bold text-white">#{index + 1}</span>
              <span className="font-mono">{shortAddress(row.walletAddress)}</span>
              <a
                href={`https://x.com/i/web/status/${row.tweetId}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-plasma"
              >
                {row.tweetId.slice(-8)}
              </a>
              <span className="font-bold text-white">{row.score}</span>
              <span>
                {row.mintAmount.toLocaleString()}{" "}
                <span className="text-silver/42">
                  {row.hasMock && row.hasReal ? t("common.mixed") : row.hasMock ? t("common.mock") : t("common.real")}
                </span>
              </span>
              <span>
                {row.summonCount} <span className="text-silver/42">{formatDate(row.createdAt)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
