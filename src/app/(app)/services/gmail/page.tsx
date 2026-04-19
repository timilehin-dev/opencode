"use client";

import { useState, useEffect } from "react";
import { MailIcon } from "@/components/icons";
import { GmailView } from "@/components/dashboard/gmail-view";
import { ServicePageHeader } from "@/components/dashboard/service-page-header";
import type { GmailProfile } from "@/lib/types";

export default function GmailServicePage() {
  const [gmProfile, setGmProfile] = useState<GmailProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/gmail?action=profile");
        const json = await res.json();
        if (json.success) setGmProfile(json.data);
      } catch { /* silent */ }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <ServicePageHeader title="Gmail" icon={<MailIcon />} gmProfile={gmProfile} />
      <GmailView />
    </div>
  );
}
