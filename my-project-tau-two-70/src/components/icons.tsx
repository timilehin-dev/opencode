"use client";

import {
  RefreshCw,
  Star,
  GitFork,
  CircleAlert,
  Folder,
  FileText,
  ChevronLeft,
  ExternalLink,
  Mail,
  Search,
  Tag,
  Calendar,
  Cloud,
  Table2,
  Triangle,
  Plus,
  Trash2,
  Loader2,
  LayoutDashboard,
  Menu,
  X,
  Rocket,
  Pencil,
  MapPin,
  Clock,
  Bot,
  MessageSquare,
  Users,
  Send,
  Sparkles,
  Zap,
  Brain,
  Activity,
  Play,
  Square,
  ArrowDownUp,
  CircleDot,
  Wrench,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  MonitorUp,
  History,
  ChevronRight,
  Plug,
  Paperclip,
  FileDown,
  Upload,
} from "lucide-react";
import type { SVGProps } from "react";

// Re-export lucide-react icons with both direct names and aliased names
export {
  Star,
  Star as StarIcon,
  GitFork,
  GitFork as ForkIcon,
  CircleAlert,
  CircleAlert as IssuesIcon,
  Folder,
  Folder as FolderIcon,
  FileText,
  FileText as FileIcon,
  FileText as DocsIcon,
  ChevronLeft,
  ChevronLeft as ChevronLeftIcon,
  ExternalLink,
  ExternalLink as ExternalLinkIcon,
  Mail,
  Mail as MailIcon,
  Search,
  Search as SearchIcon,
  Tag,
  Tag as TagIcon,
  Calendar,
  Calendar as CalendarIcon,
  Cloud,
  Cloud as DriveIcon,
  Table2,
  Table2 as SheetsIcon,
  Triangle,
  Triangle as VercelIcon,
  Plus,
  Plus as PlusIcon,
  Trash2,
  Trash2 as TrashIcon,
  Loader2,
  LayoutDashboard,
  Menu,
  X,
  Rocket,
  Pencil,
  MapPin,
  Clock,
  Bot,
  Bot as BotIcon,
  MessageSquare,
  MessageSquare as ChatIcon,
  Users,
  Users as AgentsIcon,
  Send,
  Send as SendIcon,
  Sparkles,
  Sparkles as SparklesIcon,
  Zap,
  Zap as ZapIcon,
  Brain,
  Brain as BrainIcon,
  Activity,
  Activity as ActivityIcon,
  Play,
  Play as PlayIcon,
  Square,
  Square as StopIcon,
  ArrowDownUp,
  ArrowDownUp as RouteIcon,
  CircleDot,
  CircleDot as StatusIcon,
  Wrench,
  Wrench as WrenchIcon,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  ChevronUp,
  ChevronUp as ChevronUpIcon,
  Bell,
  Bell as BellIcon,
  BellOff,
  BellOff as BellOffIcon,
  CheckCheck,
  CheckCheck as CheckCheckIcon,
  CircleAlert as AlertCircle,
  Inbox,
  Inbox as InboxIcon,
  MonitorUp,
  MonitorUp as MonitorUpIcon,
  RefreshCw,
  History,
  History as HistoryIcon,
  X as XIcon,
  MessageSquare as MessageSquareIcon,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Plug,
  Plug as ServicesIcon,
  Paperclip,
  Paperclip as PaperclipIcon,
  FileDown,
  FileDown as FileDownIcon,
  Upload,
  Upload as UploadIcon,
};

// GitHub brand icon — not available in lucide-react, so we keep a custom SVG
export function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// Gmail brand icon
export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 24 24">
      <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z" fill="#EA4335" />
      <path d="M20 6l-8 5-8-5" fill="none" stroke="#FFFFFF" strokeWidth="0" />
      <path d="M4 6v12l6.5-6L4 6z" fill="#FBBC04" opacity="0.9" />
      <path d="M20 6l-6.5 6L20 18V6z" fill="#34A853" opacity="0.8" />
      <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="#EA4335" strokeWidth="0" />
    </svg>
  );
}

// Google Calendar brand icon
export function GoogleCalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 24 24">
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill="#4285F4" />
      <rect x="7" y="11" width="3" height="3" rx="0.5" fill="#4285F4" />
      <rect x="11" y="11" width="3" height="3" rx="0.5" fill="#4285F4" opacity="0.6" />
      <rect x="15" y="11" width="3" height="3" rx="0.5" fill="#4285F4" opacity="0.6" />
      <rect x="7" y="15" width="3" height="3" rx="0.5" fill="#4285F4" opacity="0.6" />
    </svg>
  );
}

// Google Drive brand icon
export function GoogleDriveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 24 24">
      <path d="M7.41 15.17L12 21l4.59-5.83H7.41z" fill="#0066DA" />
      <path d="M12 3L1.64 16.17h6.77L12 3z" fill="#00AC47" />
      <path d="M15.59 16.17L22.36 16.17L12 3l3.59 13.17z" fill="#0066DA" opacity="0.7" />
      <path d="M12 3L7.41 10.17h9.18L12 3z" fill="#FFBA00" />
      <path d="M1.64 16.17L5.16 21l6.59-8.41-3.41-3.42L1.64 16.17z" fill="#0066DA" />
    </svg>
  );
}

// Google Sheets brand icon
export function GoogleSheetsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 24 24">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" fill="#0F9D58" />
      <path d="M5 5h14v4H5V5z" fill="#0F9D58" opacity="0.7" />
      <rect x="5" y="11" width="14" height="2" fill="#0F9D58" opacity="0.3" />
      <rect x="5" y="15" width="14" height="2" fill="#0F9D58" opacity="0.3" />
      <rect x="5" y="11" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
      <rect x="8.5" y="11" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
      <rect x="12" y="11" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
      <rect x="5" y="15" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
      <rect x="8.5" y="15" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
      <rect x="12" y="15" width="3.5" height="2" fill="#0F9D58" opacity="0.2" />
    </svg>
  );
}

// Google Docs brand icon
export function GoogleDocsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 24 24">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#4285F4" />
      <path d="M14 2v6h6" fill="#A1C2FA" />
      <rect x="8" y="12" width="8" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.7" />
      <rect x="8" y="15" width="6" height="1.5" rx="0.75" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}

// Vercel brand icon
export function VercelBrandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} className={props.className ?? "w-5 h-5"} viewBox="0 0 76 65" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

export function Spinner({ color = "emerald" }: { color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-500",
    red: "text-red-500",
    blue: "text-blue-500",
    green: "text-green-500",
  };
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className={`w-8 h-8 animate-spin ${colorMap[color] || colorMap.emerald}`} />
    </div>
  );
}
