"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  DriveIcon,
  FolderIcon,
  FileIcon,
  PlusIcon,
  Spinner,
} from "@/components/icons";
import { ConnectServiceCard } from "@/components/connect-service-card";
import { timeAgo, formatFileSize } from "@/lib/helpers";
import type {
  DriveFile,
  DriveTab,
  ServiceStatus,
} from "@/lib/types";

interface DriveViewProps {
  serviceStatus: ServiceStatus | null;
}

const drvTabs: { key: DriveTab; label: string }[] = [
  { key: "files", label: "Files" },
  { key: "create", label: "Create" },
];

export function DriveView({ serviceStatus }: DriveViewProps) {
  const [drvTab, setDrvTab] = useState<DriveTab>("files");
  const [drvFiles, setDrvFiles] = useState<DriveFile[]>([]);
  // Create folder form
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderSuccess, setFolderSuccess] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDriveFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/drive?action=files&pageSize=50");
      const json = await res.json();
      if (json.success) {
        setDrvFiles(json.data);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!serviceStatus?.googledrive.connected) return;
    const controller = new AbortController();
    (async () => {
      switch (drvTab) {
        case "files": await fetchDriveFiles(); break;
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drvTab, serviceStatus]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    setFolderSuccess(false);
    setFolderError(null);
    try {
      const res = await fetch("/api/drive?action=createFolder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: newFolderName }),
      });
      const json = await res.json();
      if (json.success) {
        setFolderSuccess(true);
        setNewFolderName("");
        fetchDriveFiles();
      } else {
        setFolderError(json.error);
      }
    } catch {
      setFolderError("Failed to create folder");
    }
    setCreatingFolder(false);
  };

  if (!serviceStatus?.googledrive.connected) {
    return (
      <motion.div
        key="drive"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ConnectServiceCard
          serviceName="Google Drive"
          description="Connect your Google Drive to browse, manage, and create files and folders directly from this dashboard."
          accentColor="green"
          icon={<DriveIcon />}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="drive"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Drive Tab Navigation */}
      <nav className="border-b border-slate-800 mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {drvTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setDrvTab(tab.key); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                drvTab === tab.key
                  ? "border-green-500 text-green-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {loading && drvTab === "files" && <Spinner color="green" />}

      {/* Files Tab */}
      {drvTab === "files" && !loading && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">
              Files & Folders <span className="ml-2 text-sm font-normal text-slate-400">({drvFiles.length})</span>
            </h2>
            <button
              onClick={() => setDrvTab("create")}
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <PlusIcon /> New
            </button>
          </div>
          {drvFiles.length === 0 ? (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
              <DriveIcon />
              <p className="mt-3 text-sm">No files found in your Drive.</p>
            </div>
          ) : (
            <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] px-5 py-2.5 bg-[#151d2e] border-b border-slate-700/50 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <span>Name</span>
                <span className="text-right w-24">Modified</span>
                <span className="text-right w-20">Size</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {drvFiles.map((file) => {
                  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                  return (
                    <div key={file.id} className="grid grid-cols-[1fr_auto_auto] px-5 py-2.5 hover:bg-[#1e293b] transition-colors border-b border-slate-700/30 last:border-b-0 items-center">
                      <div className="flex items-center gap-2.5 text-sm min-w-0">
                        {isFolder ? <FolderIcon className="text-green-400" /> : <FileIcon className="text-slate-400" />}
                        {file.webViewLink ? (
                          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                            className="text-white font-medium hover:text-green-400 transition-colors truncate">
                            {file.name}
                          </a>
                        ) : (
                          <span className="text-white font-medium truncate">{file.name}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 text-right w-24">
                        {file.modifiedTime ? timeAgo(file.modifiedTime) : ""}
                      </span>
                      <span className="text-xs text-slate-500 text-right w-20">
                        {file.size ? formatFileSize(Number(file.size)) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Tab */}
      {drvTab === "create" && (
        <div className="max-w-2xl">
          <div className="bg-[#1a2332] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Create Folder</h2>
            {folderSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                Folder created successfully!
                <button onClick={() => setFolderSuccess(false)} className="ml-3 underline hover:text-emerald-300">Dismiss</button>
              </div>
            )}
            {folderError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {folderError}
                <button onClick={() => setFolderError(null)} className="ml-3 underline hover:text-red-300">Dismiss</button>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Folder Name</label>
                <input type="text" placeholder="My New Folder" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500" />
              </div>
              <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {creatingFolder && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {creatingFolder ? "Creating..." : "Create Folder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
