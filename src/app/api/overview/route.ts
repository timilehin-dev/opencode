import { NextResponse } from "next/server";
import { getRepo, listPullRequests, listCommits } from "@/lib/github";
import { getGmailProfile, fetchEmails } from "@/lib/composio";
import { listProjects } from "@/lib/vercel";
import { gCalListCalendars, gCalListEvents } from "@/lib/google";

export async function GET() {
  // ---------------------------------------------------------------------------
  // Service connection status (same logic as /api/services?action=status)
  // ---------------------------------------------------------------------------
  const gmailId = process.env.COMPOSIO_GMAIL_ACCOUNT_ID;
  const googleOauth = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN;
  const vercelToken = process.env.VERCEL_API_TOKEN;

  const services = {
    gmail: {
      connected: !!gmailId,
      accountId: gmailId ? `${gmailId.slice(0, 8)}...` : null,
    },
    googlecalendar: {
      connected: !!googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googledrive: {
      connected: !!googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googlesheets: {
      connected: !!googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googledocs: {
      connected: !!googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    github: {
      connected: !!process.env.GITHUB_PAT,
      accountId: process.env.GITHUB_PAT ? `${process.env.GITHUB_PAT.slice(0, 8)}...` : null,
    },
    vercel: {
      connected: !!vercelToken,
      accountId: vercelToken ? `${vercelToken.slice(0, 8)}...` : null,
    },
  };

  // ---------------------------------------------------------------------------
  // GitHub stats
  // ---------------------------------------------------------------------------
  const github: {
    repo: Record<string, unknown> | null;
    openIssues: number;
    openPRs: number;
    recentCommits: number;
    recentCommitsList: { sha: string; message: string; date: string; author: string }[];
  } = {
    repo: null,
    openIssues: 0,
    openPRs: 0,
    recentCommits: 0,
    recentCommitsList: [],
  };

  try {
    const repoData = await getRepo();
    github.repo = {
      name: repoData.name,
      full_name: repoData.full_name,
      description: repoData.description,
      stargazers_count: repoData.stargazers_count,
      forks_count: repoData.forks_count,
      open_issues_count: repoData.open_issues_count,
      language: repoData.language,
      html_url: repoData.html_url,
      updated_at: repoData.updated_at,
    };

    const [pulls, commits] = await Promise.all([
      listPullRequests("open", 1, 1).catch(() => [] as unknown[]),
      listCommits(1, 3).catch(() => [] as unknown[]),
    ]);

    github.openIssues = repoData.open_issues_count;
    github.openPRs = Array.isArray(pulls) ? pulls.length : 0;
    github.recentCommits = Array.isArray(commits) ? commits.length : 0;
    github.recentCommitsList = Array.isArray(commits)
      ? commits.slice(0, 3).map((c: any) => ({
          sha: c.sha as string,
          message: String(c.commit?.message ?? "").split("\n")[0],
          date: c.commit?.author?.date ?? "",
          author: c.commit?.author?.name ?? "",
        }))
      : [];
  } catch {
    /* GitHub not connected or API error — keep defaults */
  }

  // ---------------------------------------------------------------------------
  // Gmail stats
  // ---------------------------------------------------------------------------
  const gmailData: {
    profile: Record<string, unknown> | null;
    unreadCount: number;
    recentEmails: { id: string; from: string; subject: string; date: string; snippet: string }[];
  } = {
    profile: null,
    unreadCount: 0,
    recentEmails: [],
  };

  try {
    const profile = await getGmailProfile();
    gmailData.profile = {
      emailAddress: profile.emailAddress,
      messagesTotal: profile.messagesTotal,
      threadsTotal: profile.threadsTotal,
    };

    const inbox = await fetchEmails({
      max_results: 5,
      query: "is:unread",
    });
    gmailData.unreadCount = inbox.messages?.length || 0;

    const recent = await fetchEmails({
      max_results: 3,
    });
    gmailData.recentEmails = (recent.messages || []).slice(0, 3).map((m) => ({
      id: m.id,
      from: m.from || "Unknown",
      subject: m.subject || "(No subject)",
      date: m.date || "",
      snippet: m.snippet || "",
    }));
  } catch {
    /* Gmail not connected or API error — keep defaults */
  }

  // ---------------------------------------------------------------------------
  // Calendar stats
  // ---------------------------------------------------------------------------
  const calendarData: {
    upcomingEvents: { id: string; summary: string; start: string; end: string; location?: string }[];
    totalCalendars: number;
  } = {
    upcomingEvents: [],
    totalCalendars: 0,
  };

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const timeMax = weekLater.toISOString();

    const [cals, events] = await Promise.all([
      gCalListCalendars().catch(() => []),
      gCalListEvents("primary", timeMin, timeMax, 10).catch(() => []),
    ]);

    calendarData.totalCalendars = cals.length;
    calendarData.upcomingEvents = events.slice(0, 5).map((e) => ({
      id: e.id,
      summary: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      location: e.location,
    }));
  } catch {
    /* Calendar not connected or API error — keep defaults */
  }

  // ---------------------------------------------------------------------------
  // Vercel stats
  // ---------------------------------------------------------------------------
  const vercelData: {
    projectCount: number;
    projects: { id: string; name: string; framework: string | null; updatedAt: number }[];
  } = {
    projectCount: 0,
    projects: [],
  };

  try {
    const projects = await listProjects(10);
    vercelData.projectCount = projects.length;
    vercelData.projects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      framework: p.framework,
      updatedAt: p.updatedAt,
    }));
  } catch {
    /* Vercel not connected or API error — keep defaults */
  }

  return NextResponse.json({
    success: true,
    data: {
      services,
      github,
      gmail: gmailData,
      calendar: calendarData,
      vercel: vercelData,
    },
  });
}
