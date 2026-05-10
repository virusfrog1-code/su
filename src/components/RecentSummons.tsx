"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { compactHash, formatDate, shortAddress } from "@/lib/utils";

type ActivityRow = {
  walletAddress: string;
  tweetUrl: string;
  tweetId: string;
  score: number;
  amount: string;
  txHash?: string | null;
  isMock?: boolean;
  createdAt: string;
};

export function RecentSummons() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/activity")
      .then((response) => response.json())
      .then((data) => {
        if (mounted) setRows(data.rows || []);
      })
      .catch(() => {
        if (mounted) setRows([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="terminal-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{t("recent.title")}</h2>
        <span className="text-xs uppercase tracking-[0.25em] text-signal">{t("recent.badge")}</span>
      </div>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-silver/62">{t("recent.empty")}</p>
        ) : (
          rows.slice(0, 5).map((row) => (
            <a
              key={row.tweetId}
              href={row.tweetUrl || `https://x.com/i/web/status/${row.tweetId}`}
              target="_blank"
              rel="noreferrer"
              className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm transition hover:border-signal/40 sm:grid-cols-[1fr_auto]"
            >
              <span>
                <span className="text-white">{shortAddress(row.walletAddress)}</span>
                <span className="ml-2 text-silver/55">{t("recent.score")} {row.score}</span>
              </span>
              <span className="text-silver/55">
                {row.amount} {t("unit.shares")} / {compactHash(row.txHash)} / {row.isMock ? t("common.mock") : t("common.real")} /{" "}
                {formatDate(row.createdAt)}
              </span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
