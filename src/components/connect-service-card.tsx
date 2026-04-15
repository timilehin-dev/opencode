"use client";

import { ExternalLinkIcon } from "@/components/icons";

export function ConnectServiceCard({
  serviceName,
  description,
  accentColor,
  icon,
}: {
  serviceName: string;
  description: string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  const bgColors: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    green: "from-green-500/10 to-green-600/5 border-green-500/30",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-500/30",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-400",
    green: "text-green-400",
    amber: "text-amber-400",
  };
  const buttonColors: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-500 text-white",
    green: "bg-green-600 hover:bg-green-500 text-white",
    amber: "bg-amber-600 hover:bg-amber-500 text-white",
  };

  return (
    <div className={`bg-gradient-to-br ${bgColors[accentColor]} border rounded-xl p-8 text-center max-w-lg mx-auto`}>
      <div className={`mx-auto mb-4 ${textColors[accentColor]}`}>
        {icon}
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Connect {serviceName}</h2>
      <p className="text-slate-400 text-sm mb-6">{description}</p>
      <a
        href="https://app.composio.dev"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${buttonColors[accentColor]}`}
      >
        Open Composio Dashboard <ExternalLinkIcon />
      </a>
    </div>
  );
}
