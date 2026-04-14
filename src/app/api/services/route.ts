import { NextResponse } from "next/server";
import { getAccountId } from "@/lib/composio";

// ---------------------------------------------------------------------------
// GET handler — returns connection status for all services
// ---------------------------------------------------------------------------

export async function GET() {
  const gmailId = getAccountId("gmail");
  const calendarId = getAccountId("googlecalendar");
  const driveId = getAccountId("googledrive");
  const sheetsId = getAccountId("googlesheets");
  const docsId = getAccountId("googledocs");
  const vercelToken = process.env.VERCEL_API_TOKEN;

  const services = {
    gmail: {
      connected: !!gmailId,
      accountId: gmailId ? `${gmailId.slice(0, 8)}...` : null,
    },
    googlecalendar: {
      connected: !!calendarId,
      accountId: calendarId ? `${calendarId.slice(0, 8)}...` : null,
    },
    googledrive: {
      connected: !!driveId,
      accountId: driveId ? `${driveId.slice(0, 8)}...` : null,
    },
    googlesheets: {
      connected: !!sheetsId,
      accountId: sheetsId ? `${sheetsId.slice(0, 8)}...` : null,
    },
    googledocs: {
      connected: !!docsId,
      accountId: docsId ? `${docsId.slice(0, 8)}...` : null,
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

  return NextResponse.json({ success: true, data: services });
}
