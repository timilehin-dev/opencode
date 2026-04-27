"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  CircleAlert,
  Calendar,
  Rocket,
  Pencil,
  Plus,
  GitHubIcon,
  VercelIcon,
  MailIcon,
  CalendarIcon,
  Loader2,
  MapPin,
  Clock,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { timeAgo } from "@/lib/core/helpers";
import type { ServiceKey, ServiceStatus } from "@/lib/types";
import type { PageKey } from "@/components/dashboard/sidebar";

// ---------------------------------------------------------------------------
// Types for overview data
// ---------------------------------------------------------------------------

interface OverviewData {
  services: ServiceStatus;
  github: {
    repo: {
      name: string;
      full_name: string;
      description: string | null;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      language: string | null;
      html_url: string;
      updated_at: string;
    } | null;
    openIssues: number;
    openPRs: number;
    recentCommits: number;
    recentCommitsList: { sha: string; message: string; date: string; author: string }[];
  };
  gmail: {
    profile: {
      emailAddress: string;
      messagesTotal: number;
      threadsTotal: number;
    } | null;
    unreadCount: number;
    recentEmails: { id: string; from: string; subject: string; date: string; snippet: string }[];
  };
  calendar: {
    upcomingEvents: { id: string; summary: string; start: string; end: string; location?: string }[];
    totalCalendars: number;
  };
  vercel: {
    projectCount: number;
    projects: { id: string; name: string; framework: string | null; updatedAt: number }[];
  };
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OverviewProps {
  onNavigate: (key: PageKey) => void;
}

export function OverviewPage({ onNavigate }: OverviewProps) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/overview?action=stats");
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await fetchOverview();
    })();
    return () => controller.abort();
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load overview data.
      </div>
    );
  }

  const { github: gh, gmail: gm, calendar: cal, vercel: vc } = data;

  // ---------------------------------------------------------------------------
  // Service Status Grid
  // ---------------------------------------------------------------------------
  const serviceCards: {
    key: ServiceKey;
    label: string;
    icon: React.ReactNode;
    connected: boolean;
    stat: string;
    onClick: () => void;
  }[] = [
    {
      key: "github",
      label: "GitHub",
      icon: <GitHubIcon className="w-6 h-6" />,
      connected: !!data.services.github.connected,
      stat: `${gh.openIssues} open issues`,
      onClick: () => onNavigate("github"),
    },
    {
      key: "gmail",
      label: "Gmail",
      icon: <MailIcon className="w-6 h-6" />,
      connected: !!data.services.gmail.connected,
      stat: `${gm.profile?.messagesTotal ?? 0} messages`,
      onClick: () => onNavigate("gmail"),
    },
    {
      key: "calendar",
      label: "Calendar",
      icon: <CalendarIcon className="w-6 h-6" />,
      connected: !!data.services.googlecalendar.connected,
      stat: `${cal.upcomingEvents.length} upcoming`,
      onClick: () => onNavigate("calendar"),
    },
    {
      key: "vercel",
      label: "Vercel",
      icon: <VercelIcon className="w-6 h-6" />,
      connected: !!data.services.vercel.connected,
      stat: `${vc.projectCount} projects`,
      onClick: () => onNavigate("vercel"),
    },
  ];

  // ---------------------------------------------------------------------------
  // Quick Stats
  // ---------------------------------------------------------------------------
  const quickStats = [
    {
      label: "Unread Emails",
      value: gm.unreadCount,
      icon: <Mail className="w-5 h-5 text-red-400" />,
      bgColor: "bg-red-500/10",
    },
    {
      label: "Open Issues",
      value: gh.openIssues,
      icon: <CircleAlert className="w-5 h-5 text-amber-600" />,
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Events Today",
      value: cal.upcomingEvents.filter((e) => {
        const now = new Date();
        const end = new Date(e.end);
        return end >= now && new Date(e.start) <= new Date(now.getTime() + 86400000);
      }).length,
      icon: <Calendar className="w-5 h-5 text-blue-600" />,
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Deployments",
      value: vc.projectCount,
      icon: <Rocket className="w-5 h-5 text-foreground" />,
      bgColor: "bg-slate-500/10",
    },
  ];

  // ---------------------------------------------------------------------------
  // Quick Actions
  // ---------------------------------------------------------------------------
  const quickActions = [
    {
      label: "Compose Email",
      icon: <Pencil className="w-4 h-4" />,
      onClick: () => onNavigate("gmail"),
      color: "border-red-500/30 text-red-400 hover:bg-red-500/10",
    },
    {
      label: "Create Event",
      icon: <Plus className="w-4 h-4" />,
      onClick: () => onNavigate("calendar"),
      color: "border-blue-500/30 text-blue-600 hover:bg-blue-500/10",
    },
    {
      label: "New Issue",
      icon: <Plus className="w-4 h-4" />,
      onClick: () => onNavigate("github"),
      color: "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10",
    },
  ];

  // ---------------------------------------------------------------------------
  // Timeline items (only from the last 7 days to keep it relevant)
  // ---------------------------------------------------------------------------
  interface TimelineItem {
    id: string;
    type: "gmail" | "github" | "calendar" | "vercel";
    icon: React.ReactNode;
    description: string;
    detail: string;
    time: string;
  }

  const timeline: TimelineItem[] = [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Gmail recent emails (only from last 7 days)
  gm.recentEmails.forEach((email, i) => {
    const emailTime = email.date ? new Date(email.date).getTime() : 0;
    if (emailTime < sevenDaysAgo) return; // skip old emails

    const sender = email.from.match(/^(.+?)\s*<.*>$/)
      ? email.from.match(/^(.+?)\s*<.*>$/)![1].trim().replace(/"/g, "")
      : email.from;
    timeline.push({
      id: `gmail-${i}`,
      type: "gmail",
      icon: <MailIcon className="w-4 h-4 text-red-400" />,
      description: `New email from ${sender}`,
      detail: email.subject || "(No subject)",
      time: email.date || "",
    });
  });

  // GitHub recent commits (only from last 7 days)
  gh.recentCommitsList.forEach((commit, i) => {
    const commitTime = commit.date ? new Date(commit.date).getTime() : 0;
    if (commitTime < sevenDaysAgo) return; // skip old commits

    timeline.push({
      id: `github-${i}`,
      type: "github",
      icon: <GitHubIcon className="w-4 h-4 text-foreground" />,
      description: `Commit: ${commit.message}`,
      detail: `by ${commit.author}`,
      time: commit.date,
    });
  });

  // Calendar upcoming events (only future events in next 7 days)
  const now = new Date();
  cal.upcomingEvents.forEach((evt, i) => {
    const startTime = evt.start ? new Date(evt.start).getTime() : 0;
    if (startTime < now.getTime()) return; // skip past events

    const startTimeStr = evt.start
      ? new Date(evt.start).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
    timeline.push({
      id: `calendar-${i}`,
      type: "calendar",
      icon: <CalendarIcon className="w-4 h-4 text-blue-600" />,
      description: `Upcoming: ${evt.summary}`,
      detail: evt.location || startTimeStr,
      time: evt.start,
    });
  });

  // Vercel recent deployments (only from last 7 days)
  vc.projects.forEach((project, i) => {
    const projTime = project.updatedAt ? new Date(project.updatedAt).getTime() : 0;
    if (projTime < sevenDaysAgo) return; // skip old deployments

    timeline.push({
      id: `vercel-${i}`,
      type: "vercel",
      icon: <VercelIcon className="w-4 h-4 text-foreground" />,
      description: `Deployment: ${project.name}`,
      detail: project.framework || "Unknown framework",
      time: new Date(project.updatedAt).toISOString(),
    });
  });

  // Sort timeline by time (most recent first)
  timeline.sort((a, b) => {
    const timeA = a.time ? new Date(a.time).getTime() : 0;
    const timeB = b.time ? new Date(b.time).getTime() : 0;
    return timeB - timeA;
  });

  const typeColorMap: Record<string, string> = {
    gmail: "bg-red-500/20 border-red-500/30",
    github: "bg-slate-500/20 border-slate-500/30",
    calendar: "bg-blue-500/20 border-blue-500/30",
    vercel: "bg-slate-400/20 border-slate-400/30",
  };

  const typeLineColorMap: Record<string, string> = {
    gmail: "bg-red-500",
    github: "bg-slate-500",
    calendar: "bg-blue-500",
    vercel: "bg-slate-400",
  };

  // ---------------------------------------------------------------------------
  // Format time for calendar events
  // ---------------------------------------------------------------------------
  function formatEventTime(isoStr: string): string {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function isAllDay(isoStr: string): boolean {
    return isoStr.includes("T") ? false : true;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Page Header */}
      <div className="mb-8 pl-0 lg:pl-0">
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of all your connected services
        </p>
      </div>

      {/* A. Service Status Grid */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {serviceCards.map((svc) => (
          <motion.div key={svc.key} variants={itemVariants}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={svc.onClick}
              className="w-full text-left"
            >
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-muted-foreground">{svc.icon}</span>
                    <Badge
                      variant={svc.connected ? "success" : "destructive"}
                      className="text-[10px] px-2 py-0"
                    >
                      {svc.connected ? "Connected" : "Offline"}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{svc.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{svc.stat}</p>
                </CardContent>
              </Card>
            </motion.button>
          </motion.div>
        ))}
      </motion.div>

      {/* B. Quick Stats Row */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {quickStats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2.5 rounded-lg", stat.bgColor)}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* C. Quick Actions Bar */}
      <motion.div
        className="mb-6"
        variants={itemVariants}
        initial="hidden"
        animate="show"
      >
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200",
                action.color
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Main content area + Right sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* D. Recent Activity Timeline (2/3 width on desktop) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No recent activity found. Connect services to see updates.
                </div>
              ) : (
                <div className="space-y-0">
                  {timeline.map((item, index) => (
                    <div key={item.id} className="flex gap-3">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0",
                            typeColorMap[item.type]
                          )}
                        >
                          {item.icon}
                        </div>
                        {index < timeline.length - 1 && (
                          <div
                            className={cn(
                              "w-px flex-1 mt-1",
                              typeLineColorMap[item.type]
                            )}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="pb-6 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.detail}
                        </p>
                        {item.time && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1">
                            {timeAgo(item.time)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* E. Upcoming Events Mini-Calendar (1/3 width on desktop) */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Upcoming Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cal.upcomingEvents.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No upcoming events this week.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                  {cal.upcomingEvents
                    .filter((evt) => {
                      const start = evt.start ? new Date(evt.start).getTime() : 0;
                      return start >= Date.now();
                    })
                    .slice(0, 5)
                    .map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-lg bg-accent/50 border border-border/50 hover:border-primary/30 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {evt.summary}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {isAllDay(evt.start) ? (
                          <span>
                            {new Date(evt.start + "T00:00:00").toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                        ) : (
                          <span>{formatEventTime(evt.start)}</span>
                        )}
                      </div>
                      {evt.location && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{evt.location}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
