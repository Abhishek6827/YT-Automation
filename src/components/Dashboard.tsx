"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Helper to ensure requests include cookies (NextAuth session)
const apiFetch = (input: RequestInfo, init?: RequestInit) => {
  return fetch(input, {
    credentials: "include",
    ...(init || {}),
  } as RequestInit);
};

interface Video {
  id: string;
  driveId: string;
  fileName: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  transcript: string | null;
  status: string;
  youtubeId: string | null;
  uploadedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  folderId?: string | null;
  folderName?: string | null;
  visibility?: string;
  copyrightStatus?: string;
}

interface FolderNode {
  id: string;
  name: string;
  videoCount: number;
  children: FolderNode[];
  included?: boolean;
}

interface CopyrightStatus {
  pending: number;
  clear: number;
  claimed: number;
}

interface Settings {
  driveFolderLink: string | null;
  uploadHour: number;
  videosPerDay: number;
}

interface ChannelInfo {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: string;
  videoCount: string;
}

interface AutomationResult {
  processed: number;
  uploaded: number;
  failed: number;
  errors: string[];
  details: {
    fileName: string;
    status: string;
    youtubeId?: string;
    error?: string;
  }[];
}

// Icons as components for cleaner code
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const EditIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const SparklesIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
  <svg
    className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const FolderIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    className="w-3 h-3"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={3}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const EyeIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

// Enhanced Folder Tree Item Component with upload progress
interface FolderTreeNode {
  id: string;
  name: string;
  videoCount: number;
  children: FolderTreeNode[];
}

const FolderTreeItem = ({
  node,
  level,
  uploadedVideos,
  onSelectFolder,
}: {
  node: FolderTreeNode;
  level: number;
  uploadedVideos: Video[];
  onSelectFolder?: (folderId: string, folderName: string) => void;
}) => {
  const [expanded, setExpanded] = useState(level < 2); // Only expand first 2 levels by default
  const hasChildren = node.children && node.children.length > 0;

  // Count how many videos from this folder have been uploaded
  const uploadedFromThisFolder = uploadedVideos.filter(
    (v) => v.folderName === node.name,
  ).length;
  const hasUploads = uploadedFromThisFolder > 0;

  // Calculate total videos including nested folders
  const getTotalVideos = (n: FolderTreeNode): number => {
    let total = n.videoCount;
    for (const child of n.children) {
      total += getTotalVideos(child);
    }
    return total;
  };
  const totalInTree = getTotalVideos(node);
  const totalUploaded = uploadedVideos.filter((v) => {
    // Check if video belongs to this folder or any child folder
    const checkFolder = (n: FolderTreeNode): boolean => {
      if (v.folderName === n.name) return true;
      return n.children.some((child) => checkFolder(child));
    };
    return checkFolder(node);
  }).length;

  return (
    <div>
      <div
        className={`flex items-center gap-2 p-1.5 rounded hover:bg-zinc-700/50 cursor-pointer transition-colors ${hasUploads ? "bg-emerald-500/5" : ""}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() =>
          hasChildren
            ? setExpanded(!expanded)
            : onSelectFolder?.(node.id, node.name)
        }
      >
        {hasChildren ? (
          <span
            className={`text-zinc-500 transition-transform text-xs ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
        ) : (
          <span className="w-3" />
        )}
        <FolderIcon />
        <span className="text-zinc-300 truncate flex-1 text-xs">
          {node.name}
        </span>

        {/* Show upload progress if this folder has videos */}
        {node.videoCount > 0 ? (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${uploadedFromThisFolder > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}
          >
            {uploadedFromThisFolder}/{node.videoCount}
          </span>
        ) : totalInTree > 0 ? (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${totalUploaded > 0 ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-500"}`}
          >
            {totalUploaded}/{totalInTree} total
          </span>
        ) : null}
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <FolderTreeItem
            key={child.id}
            node={child}
            level={level + 1}
            uploadedVideos={uploadedVideos}
            onSelectFolder={onSelectFolder}
          />
        ))}
    </div>
  );
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<Settings>({
    driveFolderLink: "",
    uploadHour: 10,
    videosPerDay: 1,
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<AutomationResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Edit Modal State
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    tags: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<Video | null>(
    null,
  );

  // Bulk Selection & Drive Preview State
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [drivePreviewOpen, setDrivePreviewOpen] = useState(false);

  const [driveFiles, setDriveFiles] = useState<
    { id: string; name: string; driveUrl: string }[]
  >([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);
  const [isBulkUploading, setIsBulkUploading] = useState(false);

  // Copyright Status State
  const [copyrightStatus, setCopyrightStatus] =
    useState<CopyrightStatus | null>(null);
  const [isCheckingCopyright, setIsCheckingCopyright] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Schedule Modal State
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  // Fetch functions
  const fetchSettings = useCallback(async () => {
    try {
      const res = await apiFetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data) setSettings(data);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await apiFetch("/api/videos");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setVideos(data);
      }
    } catch (error) {
      console.error("Error fetching videos:", error);
    }
  }, []);

  const fetchChannel = useCallback(async () => {
    try {
      const res = await apiFetch("/api/channel");
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) setChannel(data);
      }
    } catch (error) {
      console.error("Error fetching channel:", error);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/automation/run");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pendingCount || 0);
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSettings();
      fetchVideos();
      fetchChannel();
      fetchStatus();
    }
  }, [status, fetchSettings, fetchVideos, fetchChannel, fetchStatus]);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      fetchStatus();
    } catch (error) {
      console.error("Error saving settings:", error);
    }
    setIsSaving(false);
  };

  const runAutomation = async (
    draftOnly: boolean = false,
    customScheduleTime?: Date,
  ) => {
    setIsRunning(true);
    setLastResult(null);
    try {
      // Also scan folder structure to show progress
      if (settings.driveFolderLink) {
        // scanFolderStructure(); // Removed
      }

      const payload: any = { draftOnly, limit: settings.videosPerDay };
      if (customScheduleTime) {
        payload.scheduleTime = customScheduleTime.toISOString();
      }

      const res = await apiFetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({
          processed: 0,
          uploaded: 0,
          failed: 0,
          errors: [data.error || "Failed"],
          details: [],
        });
      } else {
        setLastResult(data);
        fetchVideos();
        fetchStatus();
        fetchStatus();
        setIsScheduleOpen(false); // Close modal on success
      }
    } catch (error) {
      console.error("Error running automation:", error);
      setLastResult({
        processed: 0,
        uploaded: 0,
        failed: 0,
        errors: ["Unexpected error"],
        details: [],
      });
    }
    setIsRunning(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmVideo) return;
    const id = deleteConfirmVideo.id;
    setDeleteConfirmVideo(null);
    setIsDeleting(id);
    try {
      const res = await apiFetch(`/api/videos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v.id !== id));
        // Remove from selection if present
        if (selectedVideos.has(id)) {
          const newSet = new Set(selectedVideos);
          newSet.delete(id);
          setSelectedVideos(newSet);
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete");
    }
    setIsDeleting(null);
  };

  // Bulk Delete Functions
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedVideos);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedVideos(newSet);
  };

  const selectAll = (filteredVideos: Video[]) => {
    if (
      selectedVideos.size === filteredVideos.length &&
      filteredVideos.length > 0
    ) {
      setSelectedVideos(new Set()); // Deselect all
    } else {
      setSelectedVideos(new Set(filteredVideos.map((v) => v.id)));
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    if (selectedVideos.size === 0) return;

    const videosToDelete = Array.from(selectedVideos);
    const totalCount = videosToDelete.length;
    let successCount = 0;
    let failCount = 0;
    const failedIds: string[] = [];

    // Show progress - set first video as deleting
    setIsDeleting(videosToDelete[0]);

    // Process deletions sequentially to track progress
    for (const id of videosToDelete) {
      setIsDeleting(id);
      try {
        const res = await apiFetch(`/api/videos/${id}`, { method: "DELETE" });
        if (res.ok) {
          successCount++;
          // Remove from local state immediately on success
          setVideos((prev) => prev.filter((v) => v.id !== id));
        } else {
          failCount++;
          failedIds.push(id);
          console.error(`Failed to delete ${id}:`, await res.text());
        }
      } catch (e) {
        failCount++;
        failedIds.push(id);
        console.error("Failed to delete video:", id, e);
      }
    }

    setIsDeleting(null);
    setSelectedVideos(new Set(failedIds)); // Keep failed ones selected

    // Show result summary
    if (failCount > 0) {
      alert(
        `Deleted ${successCount}/${totalCount} videos. ${failCount} failed (may need to re-login for permissions).`,
      );
    }
  };



  const handleBulkUpload = async () => {
    if (selectedVideos.size === 0) return;
    setIsBulkUploading(true);

    try {
      const videoIds = Array.from(selectedVideos);
      const res = await apiFetch("/api/videos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(
          `Upload complete! Success: ${data.successCount}, Failed: ${data.failCount}`,
        );
        fetchVideos();
        setSelectedVideos(new Set()); // Clear selection
      } else {
        alert("Upload failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Error during bulk upload");
    }
    setIsBulkUploading(false);
  };

  const openDrivePreview = async () => {
    setDrivePreviewOpen(true);
    setIsPreviewLoading(true);
    try {
      const res = await apiFetch("/api/automation/preview");
      if (res.ok) {
        const data = await res.json();
        setDriveFiles(data.files || []);
      } else {
        const data = await res.json();
        alert("Failed to load Drive files: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Error connecting to Drive API");
    }
    setIsPreviewLoading(false);
  };



  // Check copyright status for eligible videos
  const checkCopyrightStatus = async () => {
    setIsCheckingCopyright(true);
    try {
      const res = await apiFetch("/api/videos/check-copyright", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checked > 0) {
          alert(
            `Checked ${data.checked} videos. ${data.madePublic} made public, ${data.flagged} flagged for copyright.`,
          );
          fetchVideos();
        } else {
          alert(
            "No eligible videos to check (must be 24+ hours since upload).",
          );
        }
      }
      // Refresh copyright status
      const statusRes = await apiFetch("/api/videos/check-copyright");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setCopyrightStatus({
          pending: statusData.pending,
          clear: statusData.clear,
          claimed: statusData.claimed,
        });
      }
    } catch (e) {
      console.error(e);
      alert("Error checking copyright status");
    }
    setIsCheckingCopyright(false);
  };

  // Fetch copyright status on load
  const fetchCopyrightStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/videos/check-copyright");
      if (res.ok) {
        const data = await res.json();
        setCopyrightStatus({
          pending: data.pending,
          clear: data.clear,
          claimed: data.claimed,
        });
      }
    } catch (error) {
      console.error("Error fetching copyright status:", error);
    }
  }, []);

  const openEditModal = (video: Video) => {
    setEditingVideo(video);
    setEditForm({
      title: video.title || video.fileName,
      description: video.description || "",
      tags: video.tags || "",
    });
  };

  const saveEdit = async (approve: boolean = false) => {
    if (!editingVideo) return;
    setIsSavingEdit(true);
    try {
      const res = await apiFetch(`/api/videos/${editingVideo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          tags: editForm.tags,
          status: approve ? "PENDING" : editingVideo.status,
        }),
      });
      if (res.ok) {
        setEditingVideo(null);
        fetchVideos();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save");
      }
    } catch (e) {
      console.error(e);
    }
    setIsSavingEdit(false);
  };

  const regenerateWithAI = async () => {
    if (!editingVideo) return;
    setIsRegenerating(true);
    try {
      console.log("Regenerating metadata for:", editingVideo.fileName);
      const res = await apiFetch("/api/ai/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: editingVideo.fileName }),
      });
      const data = await res.json();
      console.log("AI Response:", data);
      if (res.ok && data.title) {
        setEditForm({
          title: data.title,
          description: data.description || editForm.description,
          tags: data.tags || editForm.tags,
        });
      } else {
        console.error(
          "AI regeneration failed:",
          data.error || "No data returned",
        );
        alert("Failed to regenerate: " + (data.error || "Please try again"));
      }
    } catch (e) {
      console.error("AI regeneration error:", e);
      alert("Failed to regenerate metadata");
    }
    setIsRegenerating(false);
  };

  const approveVideo = async (video: Video) => {
    try {
      await apiFetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING" }),
      });
      fetchVideos();
    } catch (e) {
      console.error(e);
    }
  };

  const formatNumber = (num: string | number | undefined) => {
    if (!num) return "-";
    const n = typeof num === "string" ? parseInt(num) : num;
    // Show exact number with thousand separators
    return n.toLocaleString();
  };

  const getStatusBadge = (videoStatus: string) => {
    const styles: Record<string, string> = {
      UPLOADED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      PROCESSING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      DRAFT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    };
    return (
      <Badge
        className={`${styles[videoStatus] || "bg-zinc-500/10 text-zinc-400"} transition-all duration-300`}
      >
        {videoStatus}
      </Badge>
    );
  };

  // Not logged in
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

        <Card className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border-zinc-800 relative z-10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/30 animate-in zoom-in duration-500 delay-200">
              <svg
                className="w-10 h-10 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold text-white tracking-tight animate-in fade-in duration-500 delay-300">
              Studio Pro
            </CardTitle>
            <CardDescription className="text-zinc-400 animate-in fade-in duration-500 delay-400">
              Automate your YouTube channel with AI-powered uploads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 animate-in fade-in duration-500 delay-500">
            <Button
              onClick={() => signIn("google")}
              className="w-full bg-white text-zinc-900 hover:bg-zinc-200 font-medium h-12 text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-zinc-500 animate-pulse">Loading Studio...</p>
        </div>
      </div>
    );
  }

  const drafts = videos.filter((v) => v.status === "DRAFT");
  const published = videos.filter((v) => v.status !== "DRAFT");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Enhanced Animated Live Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />

        {/* Moving gradient orbs with CSS animation */}
        <div
          className="absolute -top-40 -left-40 w-[800px] h-[800px] bg-gradient-radial from-red-500/30 via-orange-500/15 to-transparent rounded-full blur-3xl opacity-60"
          style={{ animation: "float 20s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-60 -right-60 w-[700px] h-[700px] bg-gradient-radial from-blue-600/25 via-cyan-500/15 to-transparent rounded-full blur-3xl opacity-60"
          style={{
            animation: "float 25s ease-in-out infinite reverse",
            animationDelay: "-5s",
          }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-gradient-radial from-purple-500/20 via-pink-500/10 to-transparent rounded-full blur-3xl opacity-50"
          style={{
            animation: "float 18s ease-in-out infinite",
            animationDelay: "-3s",
          }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-gradient-radial from-emerald-500/15 via-teal-500/10 to-transparent rounded-full blur-3xl opacity-40"
          style={{
            animation: "float 22s ease-in-out infinite reverse",
            animationDelay: "-7s",
          }}
        />

        {/* Subtle aurora effect */}
        <div
          className="absolute top-0 left-0 right-0 h-[50vh] bg-gradient-to-b from-red-500/5 via-transparent to-transparent"
          style={{ animation: "aurora 15s ease-in-out infinite" }}
        />

        {/* Floating particles */}
        <div
          className="absolute top-1/4 left-1/5 w-1 h-1 bg-white/40 rounded-full"
          style={{ animation: "twinkle 3s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-red-400/50 rounded-full"
          style={{
            animation: "twinkle 4s ease-in-out infinite",
            animationDelay: "1s",
          }}
        />
        <div
          className="absolute top-2/3 left-1/3 w-1 h-1 bg-blue-400/50 rounded-full"
          style={{
            animation: "twinkle 3.5s ease-in-out infinite",
            animationDelay: "0.5s",
          }}
        />
        <div
          className="absolute bottom-1/3 right-1/3 w-1.5 h-1.5 bg-purple-400/50 rounded-full"
          style={{
            animation: "twinkle 4.5s ease-in-out infinite",
            animationDelay: "2s",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-1 h-1 bg-cyan-400/50 rounded-full"
          style={{
            animation: "twinkle 3s ease-in-out infinite",
            animationDelay: "1.5s",
          }}
        />

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px]" />

        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E")',
          }}
        />
      </div>

      {/* CSS Keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 30px) scale(1.02); }
        }
        @keyframes aurora {
          0%, 100% { opacity: 0.3; transform: translateX(0); }
          50% { opacity: 0.6; transform: translateX(10%); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
      `,
        }}
      />

      {/* Top Navigation */}
      <nav className="border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
                <svg
                  className="w-5 h-5 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white">
                  Studio Pro
                </span>
                <span className="ml-2 text-[10px] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-1.5 py-0.5 rounded font-medium">
                  BETA
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {channel && (
                <div className="flex items-center gap-3 bg-zinc-800/50 rounded-full pl-1.5 pr-4 py-1 border border-zinc-700/30 hover:border-zinc-600/50 transition-all duration-300">
                  {channel.thumbnail ? (
                    <img
                      src={channel.thumbnail}
                      alt={channel.title}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full ring-2 ring-red-500/20"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-xs font-bold">
                      {channel.title?.[0]}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-200 leading-tight">
                      {channel.title}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatNumber(channel.subscriberCount)} subscribers
                    </span>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-300"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "In Drive",
              value: pendingCount,
              sub: "Awaiting scan",
              color: "text-blue-400",
              icon: "📁",
              gradient: "from-blue-500/20 to-cyan-500/5",
            },
            {
              label: "Drafts",
              value: drafts.length,
              sub: "Ready for review",
              color: "text-purple-400",
              icon: "📝",
              gradient: "from-purple-500/20 to-pink-500/5",
            },
            {
              label: "Published",
              value: videos.filter((v) => v.status === "UPLOADED").length,
              sub: "On YouTube",
              color: "text-emerald-400",
              icon: "🚀",
              gradient: "from-emerald-500/20 to-teal-500/5",
            },
            {
              label: "Subscribers",
              value: formatNumber(channel?.subscriberCount),
              sub: "Channel growth",
              color: "text-amber-400",
              icon: "👥",
              gradient: "from-amber-500/20 to-orange-500/5",
            },
          ].map((stat, i) => (
            <Card
              key={i}
              className="bg-zinc-900/50 border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700/50 transition-all duration-500 group hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20 relative overflow-hidden"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Gradient glow effect */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      {stat.label}
                    </p>
                    <p
                      className={`text-3xl font-bold mt-1 ${stat.color} transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-lg`}
                    >
                      {stat.value}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1 group-hover:text-zinc-400 transition-colors">
                      {stat.sub}
                    </p>
                  </div>
                  <span className="text-2xl opacity-50 group-hover:opacity-100 group-hover:scale-125 transition-all duration-300">
                    {stat.icon}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings & Controls */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-zinc-900/50 border-zinc-800/50 sticky top-24">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">
                      Automation
                    </CardTitle>
                    <CardDescription className="text-zinc-500 text-xs">
                      Configure your upload schedule
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">
                    Drive Link (File or Folder)
                  </Label>
                  <Input
                    value={settings.driveFolderLink || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        driveFolderLink: e.target.value,
                      })
                    }
                    className="bg-zinc-950 border-zinc-700 text-zinc-300 focus:border-blue-500"
                    placeholder="https://drive.google.com/..."
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={openDrivePreview}
                      className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                    >
                      <EyeIcon /> <span className="ml-1">Preview Files</span>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">
                      Daily Limit
                    </Label>
                    <Select
                      value={String(settings.videosPerDay)}
                      onValueChange={(v) =>
                        setSettings({ ...settings, videosPerDay: parseInt(v) })
                      }
                    >
                      <SelectTrigger className="bg-zinc-950/50 border-zinc-700/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                        {[1, 3, 5, 10, 20, 50, 100, 500, 1000, 10000].map(
                          (n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} video{n > 1 ? "s" : ""}/day
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">
                      Upload Time
                    </Label>
                    <Select
                      value={String(settings.uploadHour)}
                      onValueChange={(v) =>
                        setSettings({ ...settings, uploadHour: parseInt(v) })
                      }
                    >
                      <SelectTrigger className="bg-zinc-950/50 border-zinc-700/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {i.toString().padStart(2, "0")}:00{" "}
                            {i < 12 ? "AM" : "PM"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>



                <div className="pt-2 border-t border-zinc-800">
                  <Button
                    onClick={() => setIsScheduleOpen(true)}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                  >
                    📅 Schedule Output for Later
                  </Button>
                </div>

                <div className="pt-2 space-y-3">
                  <Button
                    onClick={() => runAutomation(true)}
                    disabled={isRunning || !settings.driveFolderLink}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isRunning ? (
                      <>
                        <RefreshIcon spinning />{" "}
                        <span className="ml-2">Scanning...</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon />
                        <span className="ml-2">
                          Fetch & Create Draft
                        </span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => runAutomation(false)}
                    disabled={isRunning || !settings.driveFolderLink}
                    variant="secondary"
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium border border-zinc-700/50 transition-all duration-300"
                  >
                    <PlayIcon />
                    <span className="ml-2">Upload Immediately</span>
                  </Button>

                  <Button
                    onClick={saveSettings}
                    disabled={isSaving}
                    variant="outline"
                    className="w-full border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all duration-300"
                  >
                    {isSaving ? "Saving..." : "Save Settings"}
                  </Button>
                </div>

                {/* Copyright Status Section */}
                {copyrightStatus && (
                  <div className="rounded-xl p-4 bg-zinc-800/50 border border-zinc-700/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-300">
                        Copyright Protection
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={checkCopyrightStatus}
                        disabled={isCheckingCopyright}
                        className="h-7 text-xs text-blue-400 hover:text-blue-300"
                      >
                        {isCheckingCopyright ? (
                          <RefreshIcon spinning />
                        ) : (
                          "Check Now"
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="text-amber-400 font-bold">
                          {copyrightStatus.pending}
                        </div>
                        <div className="text-zinc-500">Pending</div>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="text-emerald-400 font-bold">
                          {copyrightStatus.clear}
                        </div>
                        <div className="text-zinc-500">Clear</div>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                        <div className="text-rose-400 font-bold">
                          {copyrightStatus.claimed}
                        </div>
                        <div className="text-zinc-500">Claimed</div>
                      </div>
                    </div>
                  </div>
                )}



                {lastResult && (
                  <div
                    className={`rounded-xl p-4 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 ${lastResult.failed > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-zinc-300">Result</span>
                      <span
                        className={
                          lastResult.failed > 0
                            ? "text-red-400"
                            : "text-emerald-400"
                        }
                      >
                        {lastResult.uploaded > 0
                          ? `${lastResult.uploaded} uploaded to YouTube`
                          : `${lastResult.processed} drafts created`}
                      </span>
                    </div>
                    {lastResult.errors?.map((e, i) => (
                      <p key={i} className="text-xs text-red-400 truncate">
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Content Library */}
          <div className="lg:col-span-2">
            <Card className="bg-zinc-900/50 border-zinc-800/50 h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg text-white">
                    Content Library
                  </CardTitle>
                  <CardDescription className="text-zinc-500">
                    Manage your videos
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchVideos}
                  className="text-zinc-400 hover:text-white"
                >
                  <RefreshIcon /> <span className="ml-2">Refresh</span>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs
                  defaultValue="published"
                  className="w-full"
                  onValueChange={() => setSelectedVideos(new Set())}
                >
                  <TabsList className="w-full rounded-none border-b border-zinc-800/50 bg-transparent p-0">
                    <TabsTrigger
                      value="published"
                      className="flex-1 rounded-none border-b-2 border-transparent px-4 py-3 text-zinc-400 data-[state=active]:border-red-500 data-[state=active]:text-white transition-all duration-300"
                    >
                      Published ({published.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="drafts"
                      className="flex-1 rounded-none border-b-2 border-transparent px-4 py-3 text-zinc-400 data-[state=active]:border-purple-500 data-[state=active]:text-white transition-all duration-300"
                    >
                      Drafts ({drafts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="published" className="m-0">
                    <ScrollArea className="h-[550px]">
                      {/* Bulk Actions Header */}
                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800/50 sticky top-0 z-10 backdrop-blur-sm">
                        <div className="flex items-center gap-2">
                          <div
                            onClick={() => selectAll(published)}
                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${published.length > 0 && selectedVideos.size === published.length ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 hover:border-zinc-500"}`}
                          >
                            {published.length > 0 &&
                              selectedVideos.size === published.length && (
                                <CheckIcon />
                              )}
                          </div>
                          <span className="text-sm text-zinc-400">
                            Select All
                          </span>
                        </div>
                        {selectedVideos.size > 0 && (
                          <div className="flex gap-2">
                             <Button
                              size="sm"
                              onClick={handleBulkUpload}
                              disabled={isBulkUploading}
                              className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-600 shadow-lg shadow-emerald-900/30 transition-all duration-300 hover:scale-105"
                            >
                              {isBulkUploading ? (
                                <RefreshIcon spinning />
                              ) : (
                                <span className="mr-1">☁️</span>
                              )}
                              Upload ({selectedVideos.size})
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowBulkDeleteConfirm(true)}
                              className="h-7 text-xs bg-red-600 text-white hover:bg-red-500 border-red-600 shadow-lg shadow-red-900/30 transition-all duration-300 hover:scale-105"
                            >
                              Delete ({selectedVideos.size})
                            </Button>
                          </div>
                        )}
                      </div>

                      {published.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                          <span className="text-4xl mb-4">📭</span>
                          <p>No published videos yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/30">
                          {published.map((video) => (
                            <div
                              key={video.id}
                              className={`flex flex-col lg:flex-row lg:items-center gap-4 p-4 hover:bg-zinc-800/20 transition-all duration-200 group ${selectedVideos.has(video.id) ? "bg-blue-500/5" : ""}`}
                            >
                              <div className="flex items-center gap-4">
                              {/* Checkbox */}
                              <div
                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${selectedVideos.has(video.id) ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 hover:border-zinc-500"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelection(video.id);
                                }}
                              >
                                {selectedVideos.has(video.id) && <CheckIcon />}
                              </div>
                              {/* Thumbnail */}
                              <div className="w-24 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative">
                                {video.youtubeId ? (
                                  <>
                                    <img
                                      src={`https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`}
                                      className="w-full h-full object-cover"
                                      alt=""
                                      onError={(e) => {
                                        const target =
                                          e.target as HTMLImageElement;
                                        target.style.display = "none";
                                        const fallback =
                                          target.nextElementSibling;
                                        if (fallback)
                                          (
                                            fallback as HTMLElement
                                          ).style.display = "flex";
                                      }}
                                    />
                                    <div
                                      className="w-full h-full items-center justify-center text-zinc-500 text-xs absolute inset-0 bg-zinc-800"
                                      style={{ display: "none" }}
                                    >
                                      <PlayIcon />
                                    </div>
                                    <a
                                      href={`https://youtube.com/watch?v=${video.youtubeId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200"
                                    >
                                      <PlayIcon />
                                    </a>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                                    No preview
                                  </div>
                                )}
                              </div>
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <a
                                  href={`https://drive.google.com/file/d/${video.driveId}/view`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium text-zinc-200 hover:text-blue-400 transition-colors flex items-center gap-1 truncate"
                                >
                                  {video.title || video.fileName}
                                  <ExternalLinkIcon />
                                </a>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {video.description?.slice(0, 60) ||
                                    "No description"}
                                  ...
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  {getStatusBadge(video.status)}
                                  {video.scheduledFor && (
                                    <span className="text-[10px] text-zinc-500">
                                      📅{" "}
                                      {new Date(
                                        video.scheduledFor,
                                      ).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 opacity-100 lg:opacity-50 lg:group-hover:opacity-100 transition-opacity duration-200 self-end lg:self-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditModal(video)}
                                  className="text-zinc-400 hover:text-white h-8 w-8 p-0"
                                >
                                  <EditIcon />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirmVideo(video)}
                                  disabled={isDeleting === video.id}
                                  className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0"
                                >
                                  {isDeleting === video.id ? (
                                    <RefreshIcon spinning />
                                  ) : (
                                    <TrashIcon />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="drafts" className="m-0">
                    <ScrollArea className="h-[550px]">
                      {/* Bulk Actions Header */}
                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800/50 sticky top-0 z-10 backdrop-blur-sm">
                        <div className="flex items-center gap-2">
                          <div
                            onClick={() => selectAll(drafts)}
                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${drafts.length > 0 && selectedVideos.size === drafts.length ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 hover:border-zinc-500"}`}
                          >
                            {drafts.length > 0 &&
                              selectedVideos.size === drafts.length && (
                                <CheckIcon />
                              )}
                          </div>
                          <span className="text-sm text-zinc-400">
                            Select All
                          </span>
                        </div>
                        {selectedVideos.size > 0 && (
                          <div className="flex gap-2">
                             <Button
                              size="sm"
                              onClick={handleBulkUpload}
                              disabled={isBulkUploading}
                              className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-600 shadow-lg shadow-emerald-900/30 transition-all duration-300 hover:scale-105"
                            >
                              {isBulkUploading ? (
                                <RefreshIcon spinning />
                              ) : (
                                <span className="mr-1">☁️</span>
                              )}
                              Upload ({selectedVideos.size})
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setShowBulkDeleteConfirm(true)}
                              className="h-7 text-xs bg-red-600 text-white hover:bg-red-500 border-red-600 shadow-lg shadow-red-900/30 transition-all duration-300 hover:scale-105"
                            >
                              Delete ({selectedVideos.size})
                            </Button>
                          </div>
                        )}
                      </div>

                      {drafts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                          <span className="text-4xl mb-4">✨</span>
                          <p>No drafts yet</p>
                          <p className="text-xs mt-1">
                            Click "Scan & Generate AI Metadata" to import videos
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/30">
                          {drafts.map((video) => (
                            <div
                              key={video.id}
                              className={`flex flex-col lg:flex-row lg:items-start gap-4 p-4 hover:bg-zinc-800/20 transition-all duration-200 group ${selectedVideos.has(video.id) ? "bg-blue-500/5" : ""}`}
                            >
                              <div className="flex items-center gap-4">
                              {/* Checkbox */}
                              <div
                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${selectedVideos.has(video.id) ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 hover:border-zinc-500"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelection(video.id);
                                }}
                              >
                                {selectedVideos.has(video.id) && <CheckIcon />}
                              </div>
                              {/* Video Preview Button */}
                              <button
                                onClick={() => {
                                  setSelectedPreviewFile({
                                    id: video.driveId,
                                    name: video.fileName,
                                  });
                                  setDrivePreviewOpen(true);
                                }}
                                className="w-16 h-12 bg-zinc-800/80 rounded-lg flex items-center justify-center flex-shrink-0 border border-zinc-700/50 hover:bg-blue-600 hover:border-blue-500 transition-all duration-300 group/play cursor-pointer"
                                title="Preview Video"
                              >
                                <PlayIcon />
                              </button>
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <p className="font-medium text-zinc-200 truncate">
                                  {video.title || video.fileName}
                                </p>
                                <p className="text-xs text-zinc-500 line-clamp-2">
                                  {video.description ||
                                    "No description generated"}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {video.tags
                                    ?.split(",")
                                    .slice(0, 5)
                                    .map((t, i) => (
                                      <span
                                        key={i}
                                        className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded"
                                      >
                                        #{t.trim()}
                                      </span>
                                    ))}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2 flex-shrink-0 self-end lg:self-auto">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditModal(video)}
                                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8"
                                >
                                  <EditIcon />
                                  <span className="ml-1">Edit</span>
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => approveVideo(video)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteConfirmVideo(video)}
                                  disabled={isDeleting === video.id}
                                  className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0"
                                >
                                  {isDeleting === video.id ? (
                                    <RefreshIcon spinning />
                                  ) : (
                                    <TrashIcon />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Edit Modal with AI Regenerate */}
      <Dialog
        open={!!editingVideo}
        onOpenChange={(open) => !open && setEditingVideo(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EditIcon />
              Edit Video Metadata
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Modify the AI-generated content or regenerate with AI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
                className="bg-zinc-950 border-zinc-700 focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                className="bg-zinc-950 border-zinc-700 h-32 focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Tags (comma separated)</Label>
              <Input
                value={editForm.tags}
                onChange={(e) =>
                  setEditForm({ ...editForm, tags: e.target.value })
                }
                className="bg-zinc-950 border-zinc-700 focus:border-blue-500"
                placeholder="shorts, viral, trending, ..."
              />
            </div>

            {/* Transcript Section */}
            <div className="space-y-2">
              <Label className="text-zinc-400 flex items-center gap-2">
                <span>🎙️</span> Video Transcript
              </Label>
              {editingVideo?.transcript ? (
                <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {editingVideo.transcript}
                  </p>
                </div>
              ) : (
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500">
                    No transcript available
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Transcript is generated from video audio via Whisper AI
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={regenerateWithAI}
              disabled={isRegenerating}
              className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 mr-auto"
            >
              {isRegenerating ? (
                <>
                  <RefreshIcon spinning />
                  <span className="ml-2">Regenerating...</span>
                </>
              ) : (
                <>
                  <SparklesIcon />
                  <span className="ml-2">Regenerate with AI</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingVideo(null)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveEdit(false)}
              disabled={isSavingEdit}
              className="bg-zinc-700 hover:bg-zinc-600 text-white"
            >
              Save Draft
            </Button>
            <Button
              onClick={() => saveEdit(true)}
              disabled={isSavingEdit}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Save & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteConfirmVideo}
        onOpenChange={(open) => !open && setDeleteConfirmVideo(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <span className="text-red-400">⚠️</span> Delete Video
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">
                &ldquo;
                {deleteConfirmVideo?.title || deleteConfirmVideo?.fileName}
                &rdquo;
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-zinc-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            This action cannot be undone. The video will be removed from your
            database and from YouTube if it was uploaded.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmVideo(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Delete Video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bulk Delete Confirmation Modal */}
      <Dialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <span className="text-red-400">⚠️</span> Delete Multiple Videos
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">
                {selectedVideos.size} videos
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-zinc-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            This action cannot be undone. Selected videos will be removed from
            your database and from YouTube if uploaded.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkDeleteConfirm(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Delete All {selectedVideos.size} Videos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drive Preview Modal */}
      <Dialog
        open={drivePreviewOpen}
        onOpenChange={(open) => {
          setDrivePreviewOpen(open);
          if (!open) setSelectedPreviewFile(null); // Reset selection when closing
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white w-[95vw] max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-zinc-800">
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              {selectedPreviewFile ? (
                <>
                  <button
                    onClick={() => setSelectedPreviewFile(null)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors mr-2"
                    title="Back to Grid"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <span className="truncate">{selectedPreviewFile.name}</span>
                </>
              ) : (
                <>
                  <FolderIcon /> Drive Files Preview
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {selectedPreviewFile
                ? "Press back arrow or close to return to file list."
                : `Click a video to play. ${driveFiles.length} files found.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-zinc-950/50 flex items-center justify-center">
            {selectedPreviewFile ? (
              /* Centered Fullscreen Video Player */
              <div className="w-full h-full flex items-center justify-center p-4">
                <div className="w-full max-w-3xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
                  <iframe
                    src={`https://drive.google.com/file/d/${selectedPreviewFile.id}/preview`}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : isPreviewLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <RefreshIcon spinning />
                <p className="text-zinc-500 text-sm">Scanning Drive...</p>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40">
                <p className="text-zinc-500">
                  No files found or unable to access folder.
                </p>
                <p className="text-zinc-600 text-xs mt-1">
                  Check permissions and folder link.
                </p>
              </div>
            ) : (
              /* File Grid */
              <div className="w-full h-full p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="relative bg-zinc-900 border border-zinc-800/50 rounded-xl overflow-hidden group hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/10 transition-all duration-300 cursor-pointer"
                      onClick={() =>
                        setSelectedPreviewFile({ id: file.id, name: file.name })
                      }
                    >
                      {/* Video thumbnail area */}
                      <div className="aspect-video flex items-center justify-center bg-zinc-800/50">
                        <div className="w-12 h-12 bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 group-hover:bg-blue-500 group-hover:text-white transition-colors duration-300 group-hover:scale-110">
                          <PlayIcon />
                        </div>
                      </div>
                      {/* File name - separate from video area */}
                      <div className="p-2 bg-zinc-900">
                        <p className="text-[11px] text-zinc-400 text-center truncate font-medium group-hover:text-zinc-200 transition-colors">
                          {file.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-zinc-800 bg-zinc-900">
            {selectedPreviewFile ? (
              <Button
                onClick={() => setSelectedPreviewFile(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                ← Back to Grid
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setDrivePreviewOpen(false);
                setSelectedPreviewFile(null);
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Modal */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Schedule Automation</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select a date and time to schedule the video upload on YouTube.
              The automation will run now, but videos will be set to 'Private'
              and scheduled to go public at this time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Publish Date & Time</Label>
              <Input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsScheduleOpen(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (scheduleDateTime) {
                  runAutomation(false, new Date(scheduleDateTime));
                }
              }}
              disabled={!scheduleDateTime || isRunning}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isRunning ? "Scheduling..." : "Run & Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
