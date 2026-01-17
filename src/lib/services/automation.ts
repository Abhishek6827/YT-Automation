import { prisma } from '@/lib/db';
import { listVideosFromFolder, downloadFile, extractFolderId } from '@/lib/services/drive';
import { generateVideoMetadata } from '@/lib/services/ai';
import { uploadVideo } from '@/lib/services/youtube';

export interface AutomationResult {
    processed: number;
    uploaded: number;
    failed: number;
    errors: string[];
    details: {
        fileName: string;
        status: 'uploaded' | 'skipped' | 'failed';
        youtubeId?: string;
        error?: string;
    }[];
}

// Main automation function - scans Drive, generates metadata, uploads to YouTube
export async function runAutomation(
    accessToken: string,
    driveFolderLink: string,
    limit: number = 1 // How many videos to process at once
): Promise<AutomationResult> {
    const result: AutomationResult = {
        processed: 0,
        uploaded: 0,
        failed: 0,
        errors: [],
        details: [],
    };

    try {
        // Extract folder ID from the link
        const folderId = extractFolderId(driveFolderLink);
        if (!folderId) {
            result.errors.push('Invalid Google Drive folder link');
            return result;
        }

        // Get list of videos from Drive
        const driveFiles = await listVideosFromFolder(accessToken, folderId);

        if (driveFiles.length === 0) {
            result.errors.push('No video files found in the folder');
            return result;
        }

        // Get already processed file IDs from database
        const existingVideos = await prisma.video.findMany({
            select: { driveId: true },
        });
        const processedIds = new Set(existingVideos.map((v: { driveId: string }) => v.driveId));

        // Filter out already processed files
        const newFiles = driveFiles.filter((f: { id: string }) => !processedIds.has(f.id));

        if (newFiles.length === 0) {
            result.errors.push('All videos have already been processed');
            return result;
        }

        // Process up to 'limit' files
        const filesToProcess = newFiles.slice(0, limit);

        for (const file of filesToProcess) {
            result.processed++;

            try {
                // Create pending record in database
                const videoRecord = await prisma.video.create({
                    data: {
                        driveId: file.id,
                        fileName: file.name,
                        status: 'PROCESSING',
                    },
                });

                // Generate metadata using AI
                const metadata = await generateVideoMetadata(file.name);

                // Update record with metadata
                await prisma.video.update({
                    where: { id: videoRecord.id },
                    data: {
                        title: metadata.title,
                        description: metadata.description,
                        tags: metadata.tags.join(','),
                    },
                });

                // Download file from Drive
                const videoStream = await downloadFile(accessToken, file.id);

                // Upload to YouTube
                const uploadResult = await uploadVideo({
                    accessToken,
                    videoStream,
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags,
                    privacyStatus: 'private', // Start with private for safety
                });

                if (uploadResult.success && uploadResult.videoId) {
                    // Update record with success
                    await prisma.video.update({
                        where: { id: videoRecord.id },
                        data: {
                            status: 'UPLOADED',
                            youtubeId: uploadResult.videoId,
                            uploadedAt: new Date(),
                        },
                    });

                    result.uploaded++;
                    result.details.push({
                        fileName: file.name,
                        status: 'uploaded',
                        youtubeId: uploadResult.videoId,
                    });
                } else {
                    // Update record with failure
                    await prisma.video.update({
                        where: { id: videoRecord.id },
                        data: {
                            status: 'FAILED',
                        },
                    });

                    result.failed++;
                    result.details.push({
                        fileName: file.name,
                        status: 'failed',
                        error: uploadResult.error,
                    });
                    result.errors.push(`Failed to upload ${file.name}: ${uploadResult.error}`);
                }
            } catch (fileError) {
                result.failed++;
                const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
                result.details.push({
                    fileName: file.name,
                    status: 'failed',
                    error: errorMessage,
                });
                result.errors.push(`Error processing ${file.name}: ${errorMessage}`);
            }
        }

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Automation error: ${errorMessage}`);
        return result;
    }
}

// Get pending videos count
export async function getPendingCount(
    accessToken: string,
    driveFolderLink: string
): Promise<number> {
    const folderId = extractFolderId(driveFolderLink);
    if (!folderId) return 0;

    try {
        const driveFiles = await listVideosFromFolder(accessToken, folderId);
        const existingVideos = await prisma.video.findMany({
            select: { driveId: true },
        });
        const processedIds = new Set(existingVideos.map((v: { driveId: string }) => v.driveId));

        return driveFiles.filter((f: { id: string }) => !processedIds.has(f.id)).length;
    } catch {
        return 0;
    }
}
