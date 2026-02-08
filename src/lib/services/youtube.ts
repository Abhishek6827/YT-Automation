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
    isQuotaError?: boolean;
}

export interface CopyrightClaimInfo {
    hasClaims: boolean;
    claims: {
        type: string;
        status: string;
        contentOwner?: string;
    }[];
}

// Upload a video to YouTube (defaults to unlisted for copyright protection)
export async function uploadVideo(params: UploadVideoParams): Promise<UploadResult> {
    const {
        accessToken,
        videoStream,
        title,
        description,
        tags,
        privacyStatus = 'unlisted', // Default to unlisted for copyright protection
        categoryId = '1', // Film & Animation category
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
                    publicStatsViewable: false,
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

        // Check for specific upload limit/quota errors
        const isQuotaError = errorMessage.includes('exceeded the number of videos') ||
            errorMessage.includes('quotaExceeded') ||
            errorMessage.includes('upload limit');

        return {
            success: false,
            error: isQuotaError ? 'Daily YouTube Upload Limit Reached. Please wait 24 hours.' : errorMessage,
            isQuotaError
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

// Delete a video from YouTube
export async function deleteVideo(accessToken: string, videoId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const youtube = createYouTubeClient(accessToken);
        await youtube.videos.delete({ id: videoId });
        return { success: true };
    } catch (error) {
        console.error('YouTube delete error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete video',
        };
    }
}

// Update video metadata on YouTube
export async function updateVideoMetadata(
    accessToken: string,
    videoId: string,
    metadata: { title: string; description: string; tags: string[] }
): Promise<{ success: boolean; error?: string }> {
    try {
        const youtube = createYouTubeClient(accessToken);
        await youtube.videos.update({
            part: ['snippet'],
            requestBody: {
                id: videoId,
                snippet: {
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags,
                    categoryId: '1',
                },
            },
        });
        return { success: true };
    } catch (error) {
        console.error('YouTube update error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update video',
        };
    }
}

// Get video status including copyright claims
export async function getVideoStatus(
    accessToken: string,
    videoId: string
): Promise<{ success: boolean; status?: string; copyrightInfo?: CopyrightClaimInfo; hasRestrictions?: boolean; error?: string }> {
    try {
        const youtube = createYouTubeClient(accessToken);

        // Get video status
        const response = await youtube.videos.list({
            part: ['status', 'contentDetails'],
            id: [videoId],
        });

        const video = response.data.items?.[0];
        if (!video) {
            return { success: false, error: 'Video not found' };
        }

        // Check for content claims using the video's status
        // Note: The YouTube API doesn't directly expose Content ID claims
        // But we can check the upload status and rejection reasons
        const uploadStatus = video.status?.uploadStatus;
        const privacyStatus = video.status?.privacyStatus;
        const rejectionReason = video.status?.rejectionReason;
        const contentRating = video.contentDetails?.contentRating;

        // Build copyright info based on available data
        const copyrightInfo: CopyrightClaimInfo = {
            hasClaims: false,
            claims: [],
        };

        // Check if video was rejected due to copyright
        if (rejectionReason === 'claim' || rejectionReason === 'copyright') {
            copyrightInfo.hasClaims = true;
            copyrightInfo.claims.push({
                type: 'copyright_rejection',
                status: rejectionReason,
            });
        }

        // Check for age restrictions or other content issues
        if (contentRating && Object.keys(contentRating).length > 0) {
            // Has some content rating applied
            console.log(`[YouTube] Video ${videoId} has content rating:`, contentRating);
        }

        const regionRestriction = video.contentDetails?.regionRestriction;

        return {
            success: true,
            status: `${uploadStatus}/${privacyStatus}`,
            copyrightInfo,
            hasRestrictions: copyrightInfo.hasClaims || !!regionRestriction, // Flag if any restriction exists
        };
    } catch (error) {
        console.error('YouTube status check error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get video status',
        };
    }
}

// Update video visibility (privacy status)
export async function updateVideoVisibility(
    accessToken: string,
    videoId: string,
    visibility: 'public' | 'unlisted' | 'private'
): Promise<{ success: boolean; error?: string }> {
    try {
        const youtube = createYouTubeClient(accessToken);

        // First get the current video to preserve snippet data
        const getResponse = await youtube.videos.list({
            part: ['snippet', 'status'],
            id: [videoId],
        });

        const video = getResponse.data.items?.[0];
        if (!video) {
            return { success: false, error: 'Video not found' };
        }

        // Update with new visibility
        // Update with new visibility
        await youtube.videos.update({
            part: ['status'],
            requestBody: {
                id: videoId,
                status: {
                    privacyStatus: visibility,
                    selfDeclaredMadeForKids: video.status?.selfDeclaredMadeForKids || false,
                    // If we are setting to private, user might want to clear publishAt to 'unschedule' it.
                    // However, we need to explicitly pass null to clear it if the API supports it, 
                    // or just setting privacyStatus='private' might be enough if not 'scheduled'?
                    // To be safe, if we are forcing private, we try to clear publishAt by not sending it? 
                    // Actually, to nullify, we might need to send null. 
                    // TS issue: publishAt expects string | null | undefined.
                    publishAt: visibility === 'private' ? null : undefined
                },
            },
        });

        console.log(`[YouTube] Updated video ${videoId} visibility to ${visibility}`);
        return { success: true };
    } catch (error) {
        console.error('YouTube visibility update error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update visibility',
        };
    }
}

// Get list of uploaded videos with their status
export async function getUploadedVideos(
    accessToken: string,
    maxResults: number = 50
): Promise<{ videos: { id: string; title: string; status: string; publishedAt: string }[]; error?: string }> {
    try {
        const youtube = createYouTubeClient(accessToken);

        // Get the uploads playlist
        const channelResponse = await youtube.channels.list({
            part: ['contentDetails'],
            mine: true,
        });

        const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) {
            return { videos: [], error: 'Could not find uploads playlist' };
        }

        // Get videos from uploads playlist
        const playlistResponse = await youtube.playlistItems.list({
            part: ['snippet', 'status'],
            playlistId: uploadsPlaylistId,
            maxResults,
        });

        const videos = (playlistResponse.data.items || []).map(item => ({
            id: item.snippet?.resourceId?.videoId || '',
            title: item.snippet?.title || '',
            status: item.status?.privacyStatus || 'unknown',
            publishedAt: item.snippet?.publishedAt || '',
        }));

        return { videos };
    } catch (error) {
        console.error('Error getting uploaded videos:', error);
        return {
            videos: [],
            error: error instanceof Error ? error.message : 'Failed to get videos',
        };
    }
}

