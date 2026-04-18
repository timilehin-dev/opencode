"use client";

import { useState, useEffect, useCallback } from "react";
import { AgentCrew } from "@/components/dashboard/agent-crew";
import { OpsFeed } from "@/components/dashboard/ops-feed";
import { MissionControl } from "@/components/dashboard/mission-control";
import { ChatView } from "@/components/dashboard/chat-view";
import { getAllAgents } from "@/lib/agents";
import { useDashboardStream } from "@/hooks/use-dashboard-stream";
import type { ServiceStatus, RepoInfo as _RepoInfo, GmailProfile as _GmailProfile } from "@/lib/types";
type RepoInfo = _RepoInfo;
type GmailProfile = _GmailProfile;

export default function DashboardPage() {
  const [selectedAgentId, setSelectedAgentId] = useState("general");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [, setRepo] = useState<RepoInfo | null>(null);
  const [, setGmProfile] = useState<GmailProfile | null>(null);
  const agents = getAllAgents();

  const { agentStatuses, activity, metrics, todos, delegations, isConnected } = useDashboardStream();

  // Service-level data fetching
  const fetchServiceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/services?action=status");
      const json = await res.json();
      if (json.success) setServiceStatus(json.data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchRepo = useCallback(async () => {
    try {
      const res = await fetch("/api/github?action=repo");
      const json = await res.json();
      if (json.success) setRepo(json.data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchGmailProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail?action=profile");
      const json = await res.json();
      if (json.success) setGmProfile(json.data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await fetchServiceStatus();
      await fetchRepo();
      await fetchGmailProfile();
    })();
    return () => controller.abort();
  }, [fetchServiceStatus, fetchRepo, fetchGmailProfile]);

  return (
    <div className="flex h-full">
      {/* Left Panel — Agent Crew + Ops Feed (desktop only) */}
      <div className="hidden lg:flex w-[300px] border-r border-[#e8e5df] bg-white flex-col flex-shrink-0">
        <AgentCrew
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          agentStatuses={agentStatuses}
        />
        <OpsFeed events={activity} isConnected={isConnected} />
      </div>

      {/* Center Panel — Mission Control */}
      <div className="flex-1 overflow-y-auto custom-scrollbar mobile-scroll">
        <div className="p-4 lg:p-6">
          <MissionControl
            serviceStatus={serviceStatus}
            metrics={metrics}
            todos={todos}
            delegations={delegations}
            tasks={[]}
          />
        </div>
      </div>

      {/* Right Panel — Chat (desktop only) */}
      <div className="hidden lg:flex w-[360px] border-l border-[#e8e5df] bg-white flex-col flex-shrink-0">
        {/* Chat Tabs */}
        <div className="flex border-b border-[#e8e5df]">
          {["Chat", "Tasks", "History"].map((tab, i) => (
            <div
              key={tab}
              className={`flex-1 py-3 text-center text-xs font-semibold cursor-pointer transition-all duration-150 border-b-2 ${
                i === 0
                  ? "text-[#3730a3] border-[#3730a3]"
                  : "text-[#999999] border-transparent hover:text-[#6b6b6b]"
              }`}
            >
              {tab}
            </div>
          ))}
        </div>
        {/* ChatView */}
        <div className="flex-1 overflow-hidden">
          <ChatView />
        </div>
      </div>
    </div>
  );
}
