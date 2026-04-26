"use client";

import { useState, useEffect } from "react";
import { DocsIcon } from "@/components/icons";
import { DocsView } from "@/components/dashboard/docs-view";
import { ServicePageHeader } from "@/components/dashboard/service-page-header";
import type { ServiceStatus } from "@/lib/types";

export default function DocsServicePage() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/services?action=status");
        const json = await res.json();
        if (json.success) setServiceStatus(json.data);
      } catch { /* silent */ }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <ServicePageHeader
        title="Docs"
        icon={<DocsIcon />}
        serviceStatus={serviceStatus}
        serviceKey="googledocs"
      />
      <DocsView serviceStatus={serviceStatus} />
    </div>
  );
}
