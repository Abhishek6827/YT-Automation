'use client';

import { useEffect, useState, useCallback } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Video {
  id: string;
  driveId: string;
  fileName: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  status: string;
  youtubeId: string | null;
  uploadedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
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
  details: { fileName: string; status: string; youtubeId?: string; error?: string; }[];
}

// Icons as components for cleaner code
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<Settings>({ driveFolderLink: '', uploadHour: 10, videosPerDay: 1 });
  const [videos, setVideos] = useState<Video[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<AutomationResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  // Edit Modal State
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', tags: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<Video | null>(null);

  // Fetch functions
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data) setSettings(data);
      }
    } catch (error) { console.error('Error fetching settings:', error); }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setVideos(data);
      }
    } catch (error) { console.error('Error fetching videos:', error); }
  }, []);

  const fetchChannel = useCallback(async () => {
    try {
      const res = await fetch('/api/channel');
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) setChannel(data);
      }
    } catch (error) { console.error('Error fetching channel:', error); }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/run');
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pendingCount || 0);
      }
    } catch (error) { console.error('Error fetching status:', error); }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchSettings();
      fetchVideos();
      fetchChannel();
      fetchStatus();
    }
  }, [status, fetchSettings, fetchVideos, fetchChannel, fetchStatus]);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      fetchStatus();
    } catch (error) { console.error('Error saving settings:', error); }
    setIsSaving(false);
  };

  const runAutomation = async (draftOnly: boolean = false) => {
    setIsRunning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftOnly }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({ processed: 0, uploaded: 0, failed: 0, errors: [data.error || 'Failed'], details: [] });
      } else {
        setLastResult(data);
        fetchVideos();
        fetchStatus();
      }
    } catch (error) {
      console.error('Error running automation:', error);
      setLastResult({ processed: 0, uploaded: 0, failed: 0, errors: ['Unexpected error'], details: [] });
    }
    setIsRunning(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmVideo) return;
    const id = deleteConfirmVideo.id;
    setDeleteConfirmVideo(null);
    setIsDeleting(id);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVideos(prev => prev.filter(v => v.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (e) { console.error(e); alert('Failed to delete'); }
    setIsDeleting(null);
  };

  const openEditModal = (video: Video) => {
    setEditingVideo(video);
    setEditForm({ title: video.title || video.fileName, description: video.description || '', tags: video.tags || '' });
  };

  const saveEdit = async (approve: boolean = false) => {
    if (!editingVideo) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/videos/${editingVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          tags: editForm.tags,
          status: approve ? 'PENDING' : editingVideo.status
        })
      });
      if (res.ok) {
        setEditingVideo(null);
        fetchVideos();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } catch (e) { console.error(e); }
    setIsSavingEdit(false);
  };

  const regenerateWithAI = async () => {
    if (!editingVideo) return;
    setIsRegenerating(true);
    try {
      console.log('Regenerating metadata for:', editingVideo.fileName);
      const res = await fetch('/api/ai/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: editingVideo.fileName })
      });
      const data = await res.json();
      console.log('AI Response:', data);
      if (res.ok && data.title) {
        setEditForm({
          title: data.title,
          description: data.description || editForm.description,
          tags: data.tags || editForm.tags
        });
      } else {
        console.error('AI regeneration failed:', data.error || 'No data returned');
        alert('Failed to regenerate: ' + (data.error || 'Please try again'));
      }
    } catch (e) { 
      console.error('AI regeneration error:', e); 
      alert('Failed to regenerate metadata');
    }
    setIsRegenerating(false);
  };

  const approveVideo = async (video: Video) => {
    try {
      await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' })
      });
      fetchVideos();
    } catch (e) { console.error(e); }
  };

  const formatNumber = (num: string | number | undefined) => {
    if (!num) return '-';
    const n = typeof num === 'string' ? parseInt(num) : num;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const getStatusBadge = (videoStatus: string) => {
    const styles: Record<string, string> = {
      'UPLOADED': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'PENDING': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'PROCESSING': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'DRAFT': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'FAILED': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return <Badge className={`${styles[videoStatus] || 'bg-zinc-500/10 text-zinc-400'} transition-all duration-300`}>{videoStatus}</Badge>;
  };

  // Not logged in
  if (status === 'unauthenticated') {
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
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold text-white tracking-tight animate-in fade-in duration-500 delay-300">Studio Pro</CardTitle>
            <CardDescription className="text-zinc-400 animate-in fade-in duration-500 delay-400">
              Automate your YouTube channel with AI-powered uploads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 animate-in fade-in duration-500 delay-500">
            <Button 
              onClick={() => signIn('google')} 
              className="w-full bg-white text-zinc-900 hover:bg-zinc-200 font-medium h-12 text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-zinc-500 animate-pulse">Loading Studio...</p>
        </div>
      </div>
    );
  }

  const drafts = videos.filter(v => v.status === 'DRAFT');
  const published = videos.filter(v => v.status !== 'DRAFT');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Animated background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black pointer-events-none" />
      <div className="fixed top-0 left-1/2 w-[800px] h-[400px] bg-red-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      
      {/* Top Navigation */}
      <nav className="border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white">Studio Pro</span>
                <span className="ml-2 text-[10px] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-1.5 py-0.5 rounded font-medium">BETA</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {channel && (
                <div className="flex items-center gap-3 bg-zinc-800/50 rounded-full pl-1.5 pr-4 py-1 border border-zinc-700/30 hover:border-zinc-600/50 transition-all duration-300">
                  {channel.thumbnail ? (
                    <img src={channel.thumbnail} alt={channel.title} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full ring-2 ring-red-500/20" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-xs font-bold">{channel.title?.[0]}</div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-200 leading-tight">{channel.title}</span>
                    <span className="text-[10px] text-zinc-500">{formatNumber(channel.subscriberCount)} subscribers</span>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-300">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Queue', value: pendingCount, sub: 'Videos pending', color: 'text-blue-400', icon: '📥' },
            { label: 'Drafts', value: drafts.length, sub: 'Ready for review', color: 'text-purple-400', icon: '📝' },
            { label: 'Published', value: videos.filter(v => v.status === 'UPLOADED').length, sub: 'On YouTube', color: 'text-emerald-400', icon: '🚀' },
            { label: 'Subscribers', value: formatNumber(channel?.subscriberCount), sub: 'Channel growth', color: 'text-amber-400', icon: '👥' },
          ].map((stat, i) => (
            <Card key={i} className="bg-zinc-900/50 border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700/50 transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${stat.color} transition-transform duration-300 group-hover:scale-105`}>{stat.value}</p>
                    <p className="text-xs text-zinc-600 mt-1">{stat.sub}</p>
                  </div>
                  <span className="text-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-300">{stat.icon}</span>
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
                    <FolderIcon />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">Automation</CardTitle>
                    <CardDescription className="text-zinc-500 text-xs">Configure your upload schedule</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Drive Folder URL</Label>
                  <Input 
                    value={settings.driveFolderLink || ''}
                    onChange={(e) => setSettings({ ...settings, driveFolderLink: e.target.value })}
                    className="bg-zinc-950/50 border-zinc-700/50 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all duration-300" 
                    placeholder="https://drive.google.com/drive/folders/..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Daily Limit</Label>
                    <Select value={String(settings.videosPerDay)} onValueChange={(v) => setSettings({...settings, videosPerDay: parseInt(v)})}>
                      <SelectTrigger className="bg-zinc-950/50 border-zinc-700/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {[1,2,3,5,10].map(n => <SelectItem key={n} value={String(n)}>{n} video{n>1?'s':''}/day</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Upload Time</Label>
                    <Select value={String(settings.uploadHour)} onValueChange={(v) => setSettings({...settings, uploadHour: parseInt(v)})}>
                      <SelectTrigger className="bg-zinc-950/50 border-zinc-700/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                        {Array.from({length: 24}, (_, i) => (
                          <SelectItem key={i} value={String(i)}>{i.toString().padStart(2,'0')}:00 {i < 12 ? 'AM' : 'PM'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <Button 
                    onClick={() => runAutomation(true)}
                    disabled={isRunning || !settings.driveFolderLink}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isRunning ? <><RefreshIcon spinning /> <span className="ml-2">Scanning...</span></> : <><SparklesIcon /><span className="ml-2">Scan & Generate AI Metadata</span></>}
                  </Button>
                  
                  <Button 
                    onClick={() => runAutomation(false)}
                    disabled={isRunning || !settings.driveFolderLink}
                    variant="secondary"
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium border border-zinc-700/50 transition-all duration-300"
                  >
                    <PlayIcon /><span className="ml-2">Upload Immediately</span>
                  </Button>
                  
                  <Button onClick={saveSettings} disabled={isSaving} variant="outline" className="w-full border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all duration-300">
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>

                {lastResult && (
                  <div className={`rounded-xl p-4 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 ${lastResult.failed > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-zinc-300">Result</span>
                      <span className={lastResult.failed > 0 ? "text-red-400" : "text-emerald-400"}>
                        {lastResult.processed} processed, {lastResult.uploaded} uploaded
                      </span>
                    </div>
                    {lastResult.errors?.map((e, i) => (
                      <p key={i} className="text-xs text-red-400 truncate">{e}</p>
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
                  <CardTitle className="text-lg text-white">Content Library</CardTitle>
                  <CardDescription className="text-zinc-500">Manage your videos</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchVideos} className="text-zinc-400 hover:text-white">
                  <RefreshIcon /> <span className="ml-2">Refresh</span>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="published" className="w-full">
                  <TabsList className="w-full rounded-none border-b border-zinc-800/50 bg-transparent p-0">
                    <TabsTrigger value="published" className="flex-1 rounded-none border-b-2 border-transparent px-4 py-3 text-zinc-400 data-[state=active]:border-red-500 data-[state=active]:text-white transition-all duration-300">
                      Published ({published.length})
                    </TabsTrigger>
                    <TabsTrigger value="drafts" className="flex-1 rounded-none border-b-2 border-transparent px-4 py-3 text-zinc-400 data-[state=active]:border-purple-500 data-[state=active]:text-white transition-all duration-300">
                      Drafts ({drafts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="published" className="m-0">
                    <ScrollArea className="h-[550px]">
                      {published.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                          <span className="text-4xl mb-4">📭</span>
                          <p>No published videos yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/30">
                          {published.map((video) => (
                            <div key={video.id} className="flex items-center gap-4 p-4 hover:bg-zinc-800/20 transition-all duration-200 group">
                              {/* Thumbnail */}
                              <div className="w-24 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative">
                                {video.youtubeId ? (
                                  <>
                                    <img 
                                      src={`https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`} 
                                      className="w-full h-full object-cover"
                                      alt=""
                                      onError={(e) => { 
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const fallback = target.nextElementSibling;
                                        if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                      }}
                                    />
                                    <div className="w-full h-full items-center justify-center text-zinc-500 text-xs absolute inset-0 bg-zinc-800" style={{display: 'none'}}>
                                      <PlayIcon />
                                    </div>
                                    <a href={`https://youtube.com/watch?v=${video.youtubeId}`} target="_blank" rel="noreferrer" className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                      <PlayIcon />
                                    </a>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No preview</div>
                                )}
                              </div>
                              
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <a href={`https://drive.google.com/file/d/${video.driveId}/view`} target="_blank" rel="noreferrer" className="font-medium text-zinc-200 hover:text-blue-400 transition-colors flex items-center gap-1 truncate">
                                  {video.title || video.fileName}
                                  <ExternalLinkIcon />
                                </a>
                                <p className="text-xs text-zinc-500 truncate mt-0.5">{video.description?.slice(0, 60) || 'No description'}...</p>
                                <div className="flex items-center gap-2 mt-1">
                                  {getStatusBadge(video.status)}
                                  {video.scheduledFor && <span className="text-[10px] text-zinc-500">📅 {new Date(video.scheduledFor).toLocaleString()}</span>}
                                </div>
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
                                <Button variant="ghost" size="sm" onClick={() => openEditModal(video)} className="text-zinc-400 hover:text-white h-8 w-8 p-0">
                                  <EditIcon />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmVideo(video)} disabled={isDeleting === video.id} className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0">
                                  {isDeleting === video.id ? <RefreshIcon spinning /> : <TrashIcon />}
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
                      {drafts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                          <span className="text-4xl mb-4">✨</span>
                          <p>No drafts yet</p>
                          <p className="text-xs mt-1">Click "Scan & Generate AI Metadata" to import videos</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/30">
                          {drafts.map((video) => (
                            <div key={video.id} className="flex items-start gap-4 p-4 hover:bg-zinc-800/20 transition-all duration-200 group">
                              {/* File icon */}
                              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-purple-500/20">
                                <span className="text-lg">🎬</span>
                              </div>
                              
                              {/* Info */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <p className="font-medium text-zinc-200 truncate">{video.title || video.fileName}</p>
                                <p className="text-xs text-zinc-500 line-clamp-2">{video.description || 'No description generated'}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {video.tags?.split(',').slice(0, 5).map((t, i) => (
                                    <span key={i} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">#{t.trim()}</span>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => openEditModal(video)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8">
                                  <EditIcon /><span className="ml-1">Edit</span>
                                </Button>
                                <Button size="sm" onClick={() => approveVideo(video)} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8">
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmVideo(video)} disabled={isDeleting === video.id} className="text-zinc-400 hover:text-red-400 h-8 w-8 p-0">
                                  {isDeleting === video.id ? <RefreshIcon spinning /> : <TrashIcon />}
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
      <Dialog open={!!editingVideo} onOpenChange={(open) => !open && setEditingVideo(null)}>
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
                onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                className="bg-zinc-950 border-zinc-700 focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Description</Label>
              <Textarea 
                value={editForm.description} 
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                className="bg-zinc-950 border-zinc-700 h-32 focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Tags (comma separated)</Label>
              <Input 
                value={editForm.tags} 
                onChange={(e) => setEditForm({...editForm, tags: e.target.value})}
                className="bg-zinc-950 border-zinc-700 focus:border-blue-500"
                placeholder="shorts, viral, trending, ..."
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={regenerateWithAI} disabled={isRegenerating} className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 mr-auto">
              {isRegenerating ? <><RefreshIcon spinning /><span className="ml-2">Regenerating...</span></> : <><SparklesIcon /><span className="ml-2">Regenerate with AI</span></>}
            </Button>
            <Button variant="outline" onClick={() => setEditingVideo(null)} className="border-zinc-700 text-zinc-300">Cancel</Button>
            <Button onClick={() => saveEdit(false)} disabled={isSavingEdit} className="bg-zinc-700 hover:bg-zinc-600 text-white">Save Draft</Button>
            <Button onClick={() => saveEdit(true)} disabled={isSavingEdit} className="bg-emerald-600 hover:bg-emerald-500 text-white">Save & Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteConfirmVideo} onOpenChange={(open) => !open && setDeleteConfirmVideo(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              <span className="text-red-400">⚠️</span> Delete Video
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="text-white font-medium">&ldquo;{deleteConfirmVideo?.title || deleteConfirmVideo?.fileName}&rdquo;</span>?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-zinc-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            This action cannot be undone. The video will be removed from your database and from YouTube if it was uploaded.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmVideo(null)} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Cancel
            </Button>
            <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500 text-white">
              Delete Video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
