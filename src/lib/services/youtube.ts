import { google } from 'googleapis';
import { Readable } from 'stream';

// Create YouTube client with access token
export function createYouTubeClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.youtube({ version: 'v3', auth });
}

export interface UploadVideoParams {
    accessToken: string;
    videoStream: NodeJS.ReadableStream;
    title: string;
    description: string;
    tags: string[];
    privacyStatus?: 'private' | 'unlisted' | 'public';
    publishAt?: string; // ISO 8601 date-time string
    categoryId?: string;
}

export interface UploadResult {
    success: boolean;
    videoId?: string;
    error?: string;
}

// Upload a video to YouTube
export async function uploadVideo(params: UploadVideoParams): Promise<UploadResult> {
    const {
        accessToken,
        videoStream,
        title,
        description,
        tags,
        privacyStatus = 'private', // Default to private for safety
        categoryId = '22', // Entertainment category
        publishAt,
    } = params;

    try {
        const youtube = createYouTubeClient(accessToken);

        const response = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
                snippet: {
                    title,
                    description,
                    tags,
                    categoryId,
                },
                status: {
                    privacyStatus: publishAt ? 'private' : privacyStatus,
                    publishAt,
                    selfDeclaredMadeForKids: false,
                },
            },
            media: {
                body: videoStream as Readable,
            },
        });

        return {
            success: true,
            videoId: response.data.id || undefined,
        };
    } catch (error) {
        console.error('YouTube upload error:', error);

        const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown upload error';

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// Check remaining quota (approximate - actual quota tracking requires YouTube Reporting API)
export async function getChannelInfo(accessToken: string) {
    try {
        const youtube = createYouTubeClient(accessToken);

        const response = await youtube.channels.list({
            part: ['snippet', 'statistics'],
            mine: true,
        });

        const channel = response.data.items?.[0];

        if (!channel) {
            return null;
        }

        return {
            id: channel.id,
            title: channel.snippet?.title,
            thumbnail: channel.snippet?.thumbnails?.default?.url,
            subscriberCount: channel.statistics?.subscriberCount,
            videoCount: channel.statistics?.videoCount,
        };
    } catch (error) {
        console.error('Error getting channel info:', error);
        return null;
    }
}

// Delete video from YouTube
export async function deleteVideo(accessToken: string, videoId: string) {
    try {
        const youtube = createYouTubeClient(accessToken);
        await youtube.videos.delete({
            id: videoId
        });
        return true;
    } catch (error) {
        console.error('Error deleting Youtube video:', error);
        throw error;
    }
}
