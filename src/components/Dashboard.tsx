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
        // If API returns an error, set it in the result state so we can show it
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
        return <Badge className="bg-green-500 hover:bg-green-600">Uploaded</Badge>;
      case 'PROCESSING':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Processing</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-500 hover:bg-red-600">Failed</Badge>;
      default:
        return <Badge className="bg-gray-500 hover:bg-gray-600">Pending</Badge>;
    }
  };

  // Not logged in
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold text-white">YouTube Auto Uploader</CardTitle>
            <CardDescription className="text-gray-300">
              Automatically upload videos from Google Drive to YouTube
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => signIn('google')} 
              className="w-full bg-white text-gray-900 hover:bg-gray-100 font-semibold py-6"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
            <p className="text-xs text-center text-gray-400">
              We need access to YouTube and Google Drive to upload your videos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  // Logged in - Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">YouTube Auto Uploader</h1>
            <p className="text-gray-400">Manage your automated video uploads</p>
          </div>
          <div className="flex items-center gap-4">
            {channel && (
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                {channel.thumbnail && (
                  <img src={channel.thumbnail} alt={channel.title} className="w-8 h-8 rounded-full" />
                )}
                <span className="text-white font-medium">{channel.title}</span>
              </div>
            )}
            <Button 
              variant="outline" 
              onClick={() => signOut()}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-white">{pendingCount}</div>
                <div className="text-gray-400">Pending Videos</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-green-400">
                  {videos.filter(v => v.status === 'UPLOADED').length}
                </div>
                <div className="text-gray-400">Uploaded</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-red-400">
                  {videos.filter(v => v.status === 'FAILED').length}
                </div>
                <div className="text-gray-400">Failed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList className="bg-white/10 border-white/20">
            <TabsTrigger value="settings" className="data-[state=active]:bg-white/20 text-white">
              Settings
            </TabsTrigger>
            <TabsTrigger value="videos" className="data-[state=active]:bg-white/20 text-white">
              Video History
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card className="bg-white/10 backdrop-blur-lg border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Upload Settings</CardTitle>
                <CardDescription className="text-gray-400">
                  Configure your Google Drive folder and upload preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="driveLink" className="text-white">Google Drive Folder Link</Label>
                  <Input
                    id="driveLink"
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={settings.driveFolderLink || ''}
                    onChange={(e) => setSettings({ ...settings, driveFolderLink: e.target.value })}
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                  />
                  <p className="text-xs text-gray-400">
                    Paste the link to your Google Drive folder containing video files
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="videosPerDay" className="text-white">Videos per Run</Label>
                    <Input
                      id="videosPerDay"
                      type="number"
                      min="1"
                      max="5"
                      value={settings.videosPerDay}
                      onChange={(e) => setSettings({ ...settings, videosPerDay: parseInt(e.target.value) || 1 })}
                      className="bg-white/10 border-white/20 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uploadHour" className="text-white">Upload Hour (0-23)</Label>
                    <Input
                      id="uploadHour"
                      type="number"
                      min="0"
                      max="23"
                      value={settings.uploadHour}
                      onChange={(e) => setSettings({ ...settings, uploadHour: parseInt(e.target.value) || 10 })}
                      className="bg-white/10 border-white/20 text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    onClick={saveSettings}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </Button>
                  <Button 
                    onClick={runAutomation}
                    disabled={isRunning || !settings.driveFolderLink}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isRunning ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Running...
                      </>
                    ) : (
                      '▶ Run Now'
                    )}
                  </Button>
                </div>

                {/* Last Result */}
                {lastResult && (
                  <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-white">Last Run Result</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex gap-4 text-sm">
                        <span className="text-gray-400">
                          Processed: <span className="text-white font-medium">{lastResult.processed}</span>
                        </span>
                        <span className="text-gray-400">
                          Uploaded: <span className="text-green-400 font-medium">{lastResult.uploaded}</span>
                        </span>
                        <span className="text-gray-400">
                          Failed: <span className="text-red-400 font-medium">{lastResult.failed}</span>
                        </span>
                      </div>
                      {lastResult.errors?.length > 0 && (
                        <div className="text-sm text-red-400">
                          {lastResult.errors.map((err, i) => (
                            <p key={i}>• {err}</p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos">
            <Card className="bg-white/10 backdrop-blur-lg border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Video History</CardTitle>
                <CardDescription className="text-gray-400">
                  All videos that have been processed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-white/5">
                        <TableHead className="text-gray-400">File Name</TableHead>
                        <TableHead className="text-gray-400">Title</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400">YouTube Link</TableHead>
                        <TableHead className="text-gray-400">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {videos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                            No videos processed yet. Run the automation to start uploading!
                          </TableCell>
                        </TableRow>
                      ) : (
                        videos.map((video) => (
                          <TableRow key={video.id} className="border-white/10 hover:bg-white/5">
                            <TableCell className="text-white font-medium max-w-[200px] truncate">
                              {video.fileName}
                            </TableCell>
                            <TableCell className="text-gray-300 max-w-[200px] truncate">
                              {video.title || '-'}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(video.status)}
                            </TableCell>
                            <TableCell>
                              {video.youtubeId ? (
                                <a
                                  href={`https://youtube.com/watch?v=${video.youtubeId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline"
                                >
                                  View
                                </a>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-gray-400">
                              {new Date(video.createdAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
