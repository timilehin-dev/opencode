"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SheetsIcon, Spinner } from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import type { ServiceStatus } from "@/lib/types";

interface SheetsViewProps {
  serviceStatus: ServiceStatus | null;
}

export function SheetsView({ serviceStatus }: SheetsViewProps) {
  const [sheetsId, setSheetsId] = useState("");
  const [sheetsData, setSheetsData] = useState<string[][] | null>(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  const handleFetchSheets = async () => {
    if (!sheetsId.trim()) return;
    setSheetsLoading(true);
    setSheetsData(null);
    try {
      const res = await fetch(`/api/sheets?action=get&spreadsheetId=${encodeURIComponent(sheetsId)}`);
      const json = await res.json();
      if (json.success) setSheetsData(json.data || []);
    } catch {
      /* silent */
    }
    setSheetsLoading(false);
  };

  if (!serviceStatus?.googlesheets.connected) {
    return (
      <motion.div
        key="sheets"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ConnectServiceCard
          serviceName="Google Sheets"
          description="Connect Google Sheets to manage spreadsheets and data."
          accentColor="green"
          icon={<SheetsIcon />}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="sheets"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="max-w-4xl">
        <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-4">View Spreadsheet</h2>
          <p className="text-sm text-[#6b6b6b] mb-4">Enter a Spreadsheet ID to view its data.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              value={sheetsId}
              onChange={(e) => setSheetsId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetchSheets()}
              className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono"
            />
            <button
              onClick={handleFetchSheets}
              disabled={sheetsLoading || !sheetsId.trim()}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-[#e8e5df] disabled:text-[#999999] text-[#1a1a1a] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {sheetsLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {sheetsLoading ? "Loading..." : "Get"}
            </button>
          </div>
        </div>

        {sheetsLoading && <Spinner color="emerald" />}

        {!sheetsLoading && sheetsData && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-[#6b6b6b] mb-3">Spreadsheet Data</h3>
            {sheetsData.length === 0 ? (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-8 text-center text-[#6b6b6b]">No data found in this spreadsheet.</div>
            ) : (
              <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {sheetsData.map((row, ri) => (
                        <tr key={ri} className={ri === 0 ? "bg-[#faf9f7] border-b border-[#e8e5df]" : "border-b border-slate-700/30 last:border-b-0"}>
                          {row.map((cell, ci) => (
                            <td key={ci} className={`px-4 py-2.5 whitespace-nowrap max-w-[200px] truncate ${ri === 0 ? "text-xs font-medium text-[#6b6b6b] uppercase" : "text-[#1a1a1a]"}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
