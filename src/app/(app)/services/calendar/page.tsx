"use client";

import { useState, useEffect } from "react";
import { CalendarIcon } from "@/components/icons";
import { CalendarView } from "@/components/dashboard/calendar-view";
import { ServicePageHeader } from "@/components/dashboard/service-page-header";
import type { ServiceStatus } from "@/lib/types";

export default function CalendarServicePage() {
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
        title="Calendar"
        icon={<CalendarIcon />}
        serviceStatus={serviceStatus}
        serviceKey="googlecalendar"
      />
      <CalendarView serviceStatus={serviceStatus} />
    </div>
  );
}
