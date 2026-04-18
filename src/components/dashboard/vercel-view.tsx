"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { VercelIcon, Spinner } from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import { timeAgo } from "@/lib/helpers";
import type { ServiceStatus } from "@/lib/types";

interface VercelViewProps {
  serviceStatus: ServiceStatus | null;
}

export function VercelView({ serviceStatus }: VercelViewProps) {
  const [vcTab, setVcTab] = useState<"projects" | "domains">("projects");
  const [vcProjects, setVcProjects] = useState<{ id: string; name: string; framework: string | null; updatedAt: string }[]>([]);
  const [vcDomains, setVcDomains] = useState<{ name: string; project: { name: string } | null }[]>([]);
  const [vcLoading, setVcLoading] = useState(false);

  const fetchVercelProjects = useCallback(async () => {
    setVcLoading(true);
    try {
      const res = await fetch("/api/vercel?action=projects");
      const json = await res.json();
      if (json.success) setVcProjects(json.data || []);
    } catch {
      /* silent */
    }
    setVcLoading(false);
  }, []);

  const fetchVercelDomains = useCallback(async () => {
    setVcLoading(true);
    try {
      const res = await fetch("/api/vercel?action=domains");
      const json = await res.json();
      if (json.success) setVcDomains(json.data || []);
    } catch {
      /* silent */
    }
    setVcLoading(false);
  }, []);

  useEffect(() => {
    if (!serviceStatus?.vercel.connected) return;
    const controller = new AbortController();
    (async () => {
      switch (vcTab) {
        case "projects": await fetchVercelProjects(); break;
        case "domains": await fetchVercelDomains(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vcTab, serviceStatus]);

  if (!serviceStatus?.vercel.connected) {
    return (
      <motion.div
        key="vercel"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ConnectServiceCard
          serviceName="Vercel"
          description="Connect your Vercel account to manage deployments, projects, and environment variables."
          accentColor="blue"
          icon={<VercelIcon />}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="vercel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Vercel Tab Navigation */}
      <nav className="border-b border-[#e8e5df] mb-6">
        <div className="flex gap-0 overflow-x-auto">
          <button
            onClick={() => setVcTab("projects")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              vcTab === "projects"
                ? "border-slate-300 text-[#1a1a1a]"
                : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#d5d0c9]"
            }`}
          >
            Projects
          </button>
          <button
            onClick={() => setVcTab("domains")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              vcTab === "domains"
                ? "border-slate-300 text-[#1a1a1a]"
                : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#d5d0c9]"
            }`}
          >
            Domains
          </button>
        </div>
      </nav>

      {vcLoading && <Spinner color="blue" />}

      {/* Projects Tab */}
      {vcTab === "projects" && !vcLoading && (
        <div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-3">
            Projects <span className="ml-2 text-sm font-normal text-[#6b6b6b]">({vcProjects.length})</span>
          </h2>
          {vcProjects.length === 0 ? (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-8 text-center text-[#6b6b6b]">
              <VercelIcon />
              <p className="mt-3 text-sm">No projects found in your Vercel account.</p>
            </div>
          ) : (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] px-5 py-2.5 bg-[#faf9f7] border-b border-[#e8e5df] text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
                <span>Project</span>
                <span className="text-right w-24">Framework</span>
                <span className="text-right w-32">Last Updated</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {vcProjects.map((project) => (
                  <div key={project.id} className="grid grid-cols-[1fr_auto_auto] px-5 py-3 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0 items-center">
                    <div className="flex items-center gap-2.5 text-sm min-w-0">
                      <VercelIcon />
                      <span className="text-[#1a1a1a] font-medium truncate">{project.name}</span>
                    </div>
                    <span className="text-xs text-[#6b6b6b] text-right w-24">
                      {project.framework || "—"}
                    </span>
                    <span className="text-xs text-[#999999] text-right w-32">
                      {project.updatedAt ? timeAgo(project.updatedAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Domains Tab */}
      {vcTab === "domains" && !vcLoading && (
        <div>
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-3">
            Domains <span className="ml-2 text-sm font-normal text-[#6b6b6b]">({vcDomains.length})</span>
          </h2>
          {vcDomains.length === 0 ? (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl p-8 text-center text-[#6b6b6b]">No domains found.</div>
          ) : (
            <div className="bg-[#faf9f7] border border-[#e8e5df] rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] px-5 py-2.5 bg-[#faf9f7] border-b border-[#e8e5df] text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
                <span>Domain</span>
                <span className="text-right">Project</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {vcDomains.map((domain) => (
                  <div key={domain.name} className="grid grid-cols-[1fr_auto] px-5 py-3 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0 items-center">
                    <span className="text-sm text-[#1a1a1a] font-medium font-mono">{domain.name}</span>
                    <span className="text-xs text-[#6b6b6b] text-right">
                      {domain.project?.name || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
