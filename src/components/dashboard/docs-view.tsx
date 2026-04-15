"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { DocsIcon, Spinner } from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import { timeAgo } from "@/lib/helpers";
import type { ServiceStatus } from "@/lib/types";

interface DocsViewProps {
  serviceStatus: ServiceStatus | null;
}

export function DocsView({ serviceStatus }: DocsViewProps) {
  const [docList, setDocList] = useState<{ id: string; name: string; modifiedTime: string; webViewLink?: string }[]>([]);
  const [docLoading, setDocLoading] = useState(false);

  const fetchDocs = useCallback(async () => {
    setDocLoading(true);
    try {
      const res = await fetch("/api/docs?action=list");
      const json = await res.json();
      if (json.success) setDocList(json.data || []);
    } catch {
      /* silent */
    }
    setDocLoading(false);
  }, []);

  useEffect(() => {
    if (!serviceStatus?.googledocs.connected) return;
    const controller = new AbortController();
    (async () => {
      await fetchDocs();
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceStatus]);

  if (!serviceStatus?.googledocs.connected) {
    return (
      <motion.div
        key="docs"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ConnectServiceCard
          serviceName="Google Docs"
          description="Connect Google Docs to create, read, and edit your documents."
          accentColor="blue"
          icon={<DocsIcon />}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="docs"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div>
        {docLoading && <Spinner color="blue" />}
        {!docLoading && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              Documents <span className="ml-2 text-sm font-normal text-slate-400">({docList.length})</span>
            </h2>
            {docList.length === 0 ? (
              <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
                <DocsIcon />
                <p className="mt-3 text-sm">No documents found.</p>
              </div>
            ) : (
              <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-[#151d2e] border-b border-slate-700/50 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <span>Name</span>
                  <span className="text-right w-32">Modified</span>
                </div>
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                  {docList.map((doc) => (
                    <div key={doc.id} className="grid grid-cols-[1fr_auto] px-5 py-3 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0 items-center">
                      <div className="flex items-center gap-2.5 text-sm min-w-0">
                        <DocsIcon />
                        {doc.webViewLink ? (
                          <a href={doc.webViewLink} target="_blank" rel="noopener noreferrer"
                            className="text-white font-medium hover:text-blue-400 transition-colors truncate">
                            {doc.name}
                          </a>
                        ) : (
                          <span className="text-white font-medium truncate">{doc.name}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 text-right w-32">
                        {doc.modifiedTime ? timeAgo(doc.modifiedTime) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
