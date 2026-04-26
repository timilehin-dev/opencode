import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET handler — returns connection status for all services
// ---------------------------------------------------------------------------

export async function GET() {
  const googleOauth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  const vercelToken = process.env.VERCEL_API_TOKEN;

  const services = {
    gmail: {
      connected: googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googlecalendar: {
      connected: googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googledrive: {
      connected: googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googlesheets: {
      connected: googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    googledocs: {
      connected: googleOauth,
      accountId: googleOauth ? "Google OAuth" : null,
    },
    github: {
      connected: !!process.env.GITHUB_PAT,
      accountId: process.env.GITHUB_PAT ? `${process.env.GITHUB_PAT.slice(0, 8)}...` : null,
    },
    linkedin: {
      connected: !!process.env.LINKEDIN_ACCESS_TOKEN,
      accountId: process.env.LINKEDIN_PERSON_ID || null,
    },
    vercel: {
      connected: !!vercelToken,
      accountId: vercelToken ? `${vercelToken.slice(0, 8)}...` : null,
    },
    stitch: {
      connected: !!process.env.STITCH_API_KEY,
      accountId: process.env.STITCH_API_KEY ? `${process.env.STITCH_API_KEY.slice(0, 8)}...` : null,
    },
  };

  return NextResponse.json({ success: true, data: services });
}
