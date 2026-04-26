"use client";

import { useState, useEffect } from "react";
import { GitHubIcon } from "@/components/icons";
import { GitHubView } from "@/components/dashboard/github-view";
import { ServicePageHeader } from "@/components/dashboard/service-page-header";
import type { RepoInfo } from "@/lib/types";

export default function GitHubServicePage() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/github?action=repo");
        const json = await res.json();
        if (json.success) setRepo(json.data);
      } catch { /* silent */ }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <ServicePageHeader title="GitHub" icon={<GitHubIcon />} repo={repo} />
      <GitHubView />
    </div>
  );
}
