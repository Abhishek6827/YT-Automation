'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  details: {
    fileName: string;
    status: string;
    youtubeId?: string;
    error?: string;
  }[];
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<Settings>({
    driveFolderLink: '',
    uploadHour: 10,
    videosPerDay: 1,
  });
  const [videos, setVideos] = useState<Video[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<AutomationResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch data on load
  useEffect(() => {
    if (status === 'authenticated') {
      fetchSettings();
      fetchVideos();
      fetchChannel();
      fetchStatus();
    }
  }, [status]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      const data = await res.json();
      setVideos(data);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  const fetchChannel = async () => {
    try {
      const res = await fetch('/api/channel');
      if (res.ok) {
        const data = await res.json();
        setChannel(data);
      }
    } catch (error) {
      console.error('Error fetching channel:', error);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/automation/run');
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pendingCount || 0);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
    setIsSaving(false);
  };

  const runAutomation = async () => {
    setIsRunning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/automation/run', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (!res.ok) {
        setLastResult({
          processed: 0,
          uploaded: 0,
          failed: 0,
          errors: [data.error || 'Failed to run automation'],
          details: []
        });
      } else {
        setLastResult(data);
        fetchVideos();
        fetchStatus();
      }
    } catch (error) {
      console.error('Error running automation:', error);
      setLastResult({
        processed: 0,
        uploaded: 0,
        failed: 0,
        errors: ['An unexpected error occurred'],
        details: []
      });
    }
    setIsRunning(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UPLOADED':
        return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Uploaded</Badge>;
      case 'PROCESSING':
        return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Processing</Badge>;
      case 'FAILED':
        return <Badge className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20">Failed</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 border-slate-500/20">Pending</Badge>;
    }
  };

  // Not logged in
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 relative z-10 shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-red-900/20">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold text-white tracking-tight">Studio Access</CardTitle>
            <CardDescription className="text-zinc-400">
              Sign in to manage your automated channel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => signIn('google')} 
              className="w-full bg-white text-zinc-900 hover:bg-zinc-200 font-medium h-12 text-base transition-all"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  // Logged in - Dashboard
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Navigation */}
      <nav className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <span className="font-bold text-lg tracking-tight">Studio</span>
            </div>
            
            <div className="flex items-center gap-4">
              {channel && (
                <div className="flex items-center gap-3 bg-zinc-800/50 rounded-full pl-2 pr-4 py-1.5 border border-zinc-700/50">
                  {channel.thumbnail ? (
                    <img src={channel.thumbnail} alt={channel.title} className="w-6 h-6 rounded-full" />
                  ) : (
                     <div className="w-6 h-6 rounded-full bg-zinc-700"></div>
                  )}
                  <span className="text-sm font-medium text-zinc-200">{channel.title}</span>
                </div>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => signOut()}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Queue Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">{pendingCount}</div>
              <p className="text-xs text-zinc-500">Videos waiting to process</p>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-500 mb-1">
                {videos.filter(v => v.status === 'UPLOADED').length}
              </div>
              <p className="text-xs text-zinc-500">Successfully published</p>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Channel Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">
                {channel?.subscriberCount || '-'}
              </div>
              <p className="text-xs text-zinc-500">Subscribers</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Areas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings & Controls */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-zinc-900 border-zinc-800 sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg text-white">Automation Control</CardTitle>
                <CardDescription className="text-zinc-500">Configure your daily upload schedule</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Drive Folder</Label>
                  <Input 
                    value={settings.driveFolderLink || ''}
                    onChange={(e) => setSettings({ ...settings, driveFolderLink: e.target.value })}
                    className="bg-zinc-950 border-zinc-700 focus:border-red-500/50 focus:ring-red-500/20" 
                    placeholder="https://drive.google.com/..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <Label className="text-zinc-300">Daily Uploads</Label>
                    <Input 
                      type="number" 
                      min="1" max="10"
                      value={settings.videosPerDay}
                      onChange={(e) => setSettings({ ...settings, videosPerDay: parseInt(e.target.value) || 1 })}
                      className="bg-zinc-950 border-zinc-700" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Time (24h)</Label>
                    <Input 
                      type="number" 
                      min="0" max="23"
                      value={settings.uploadHour}
                      onChange={(e) => setSettings({ ...settings, uploadHour: parseInt(e.target.value) || 10 })}
                      className="bg-zinc-950 border-zinc-700" 
                    />
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <Button 
                    onClick={runAutomation}
                    disabled={isRunning || !settings.driveFolderLink}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                  >
                    {isRunning ? 'Processing...' : 'Run Automation Batch'}
                  </Button>
                  <Button 
                    onClick={saveSettings}
                    disabled={isSaving}
                    variant="outline"
                    className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                  </Button>
                </div>

                {lastResult && (
                  <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-4 text-sm space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                      <span className="font-medium text-zinc-400">Result</span>
                      <span className={lastResult.failed > 0 ? "text-red-400" : "text-green-400"}>
                        {lastResult.uploaded} Uploaded
                      </span>
                    </div>
                    {lastResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500 truncate">{e}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Video History */}
          <div className="lg:col-span-2">
            <Card className="bg-zinc-900 border-zinc-800 h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-white">Content Library</CardTitle>
                  <CardDescription className="text-zinc-500">History of uploaded and scheduled videos</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={fetchVideos} className="text-zinc-400">
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader className="bg-zinc-950/50">
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="w-[100px] text-zinc-400">Video</TableHead>
                        <TableHead className="text-zinc-400">Title</TableHead>
                        <TableHead className="text-zinc-400">Status</TableHead>
                        <TableHead className="text-zinc-400 text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {videos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-zinc-500">
                            No videos found. Start by running the automation.
                          </TableCell>
                        </TableRow>
                      ) : (
                        videos.map((video) => (
                          <TableRow key={video.id} className="border-zinc-800 hover:bg-zinc-800/30">
                            <TableCell>
                              <div className="w-20 h-12 bg-zinc-800 rounded overflow-hidden flex items-center justify-center relative group">
                                {video.youtubeId ? (
                                  <img 
                                    src={`https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`} 
                                    className="w-full h-full object-cover"
                                    alt="Thumbnail"
                                  />
                                ) : (
                                  <span className="text-xs text-zinc-600">No Img</span>
                                )}
                                <a 
                                  href={`https://youtube.com/watch?v=${video.youtubeId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                >
                                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium text-zinc-200 line-clamp-1">{video.title || video.fileName}</p>
                                <p className="text-xs text-zinc-500 line-clamp-1">{video.driveId}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(video.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="space-y-1">
                                <p className="text-sm text-zinc-300">
                                  {video.scheduledFor 
                                    ? new Date(video.scheduledFor).toLocaleDateString()
                                    : (video.uploadedAt ? new Date(video.uploadedAt).toLocaleDateString() : '-')
                                  }
                                </p>
                                {video.scheduledFor && (
                                  <p className="text-xs text-amber-500">
                                    {new Date(video.scheduledFor).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
