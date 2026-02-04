import { prisma } from '@/lib/db';
import { listVideosFromFolder, downloadFile, extractFolderId, downloadFileBuffer, getFileMetadata, DriveFile } from '@/lib/services/drive';
import { generateVideoMetadata, generateMetadataFromTranscript } from '@/lib/services/ai';
import { uploadVideo, getVideoStatus, updateVideoVisibility } from '@/lib/services/youtube';
import { uploadAndTranscribe } from '@/lib/services/assemblyai';

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
// Helper to getting next schedule time
export async function getNextScheduleTime(userId: string, uploadHour: number, videosPerDay: number, jobId?: string): Promise<Date> {
    // Get the last scheduled video for this user (and job if specified)
    const whereClause: any = {
        userId,
        scheduledFor: {
            not: null
        }
    };

    if (jobId) {
        whereClause.jobId = jobId;
    }

    const lastScheduled = await prisma.video.findFirst({
        where: whereClause,
        orderBy: {
            scheduledFor: 'desc'
        }
    });

    let baseDate = new Date();

    // If we have a scheduled video, check if we can fit more on that day
    if (lastScheduled?.scheduledFor) {
        const lastDate = new Date(lastScheduled.scheduledFor);

        // Count videos scheduled for that specific date for this user/job
        const startOfLastDate = new Date(lastDate);
        startOfLastDate.setHours(0, 0, 0, 0);

        const endOfLastDate = new Date(lastDate);
        endOfLastDate.setHours(23, 59, 59, 999);

        const countQuery: any = {
            userId,
            scheduledFor: {
                gte: startOfLastDate,
                lte: endOfLastDate
            }
        };
        if (jobId) {
            countQuery.jobId = jobId;
        }

        const countOnLastDate = await prisma.video.count({
            where: countQuery
        });

        if (countOnLastDate < videosPerDay) {
            // We can still schedule for this day
            baseDate = lastDate;
        } else {
            // Move to next day
            baseDate = new Date(lastDate);
            baseDate.setDate(baseDate.getDate() + 1);
        }
    } else {
        const now = new Date();
        baseDate.setHours(uploadHour, 0, 0, 0);

        if (baseDate <= now) {
            baseDate.setDate(baseDate.getDate() + 1);
        }
    }

    // Fix: Interpret uploadHour as IST (Indian Standard Time)
    // Server runs in UTC. YouTube expects UTC timestamp.
    // Logic: Treat uploadHour as the user's desired hour in UTC.
    // If user wants 21:00, we schedule for 21:00 UTC. 
    // This assumes the user input is already adjusted or they are fine with UTC.
    // The previous logic complicating IST/UTC conversion was causing issues.
    baseDate.setUTCHours(uploadHour, 0, 0, 0);

    return baseDate;
}

export async function runAutomation(
    userId: string, // New: required userId
    accessToken: string,
    driveFolderLink: string,
    limit: number = 1,
    uploadHour: number = 10,
    draftOnly: boolean = false,
    customScheduleTime?: Date, // New: Allow passing specific schedule time
    immediate: boolean = false, // New: Skip scheduling entirely
    jobId?: string // New: Link to specific automation job for independent scheduling
): Promise<AutomationResult> {
    const result: AutomationResult = {
        processed: 0,
        uploaded: 0,
        failed: 0,
        errors: [],
        details: [],
    };

    try {
        // Extract folder/file ID from the link
        const driveId = extractFolderId(driveFolderLink);
        if (!driveId) {
            result.errors.push('Invalid Google Drive link');
            return result;
        }

        // Check if it's a file or folder
        let driveFiles: DriveFile[] = [];
        try {
            const metadata = await getFileMetadata(accessToken, driveId);

            if (metadata.mimeType === 'application/vnd.google-apps.folder') {
                // It's a folder, list videos
                driveFiles = await listVideosFromFolder(accessToken, driveId);
            } else if (metadata.mimeType.startsWith('video/')) {
                // It's a single video file
                console.log(`[Automation] Processing single file: ${metadata.name}`);
                driveFiles = [{
                    ...metadata,
                    folderId: 'single_file',
                    folderName: 'Direct Link'
                }];
            } else {
                result.errors.push(`Link is neither a folder nor a video file (Type: ${metadata.mimeType})`);
                return result;
            }
        } catch (error) {
            console.error('[Automation] Error checking drive link:', error);
            result.errors.push('Failed to access Drive link (check permissions)');
            return result;
        }

        if (driveFiles.length === 0) {
            result.errors.push('No video files found');
            return result;
        }

        // Get already processed file IDs from database for this user
        // Fix: If draftOnly=true, we skip DRAFTs (already scanned).
        // If draftOnly=false, we want to include DRAFTs in processing (to upload them), so don't filter them out here.
        const excludeStatuses = ['UPLOADED', 'PROCESSING', 'PENDING'];
        if (draftOnly) {
            excludeStatuses.push('DRAFT');
        }

        const existingVideos = await prisma.video.findMany({
            where: {
                userId,
                status: {
                    in: excludeStatuses
                }
            },
            select: { driveId: true },
        });
        const processedIds = new Set(existingVideos.map((v: { driveId: string }) => v.driveId));

        // Filter out already processed files
        const newFiles = driveFiles.filter((f: { id: string }) => !processedIds.has(f.id));

        if (newFiles.length === 0) {
            result.errors.push('No new videos found (checked against Uploaded/Drafts/Pending)');
            return result;
        }

        console.log(`[Automation] User ${userId}: Total new files: ${newFiles.length}, limit: ${limit}, will process: ${Math.min(newFiles.length, limit)}`);

        // Process up to 'limit' files
        const filesToProcess = newFiles.slice(0, limit);

        for (const file of filesToProcess) {
            result.processed++;

            // Calculate Schedule Time
            // If customScheduleTime was passed, use it. Otherwise calculate based on user's schedule.
            // If immediate is true, scheduleTime is null.
            const scheduleTime: Date | null = immediate ? null : (customScheduleTime || await getNextScheduleTime(userId, uploadHour, limit, jobId));

            try {
                // Generate metadata using AI - try AssemblyAI transcription first
                let metadata;
                let transcript: string | null = null;

                // Attempt AssemblyAI transcription if API key is set
                const hasAssemblyAI = !!process.env.ASSEMBLYAI_API_KEY;

                if (hasAssemblyAI) {
                    console.log(`[Automation] Attempting AssemblyAI transcription for: ${file.name}`);
                    try {
                        // Download video buffer (up to 10MB for transcription)
                        const videoBuffer = await downloadFileBuffer(accessToken, file.id, 10 * 1024 * 1024);

                        if (videoBuffer && videoBuffer.length > 0) {
                            const transcriptionResult = await uploadAndTranscribe(videoBuffer);

                            if (transcriptionResult.success && transcriptionResult.transcript) {
                                transcript = transcriptionResult.transcript;
                                // Generate metadata from transcript
                                metadata = await generateMetadataFromTranscript(transcript, file.name);
                            }
                        }
                    } catch (transcriptError) {
                        console.error('[Automation] Transcription error:', transcriptError);
                    }
                }

                // Fallback to filename-based generation if transcription failed
                if (!metadata) {
                    console.log(`[Automation] Using filename-based metadata for: ${file.name}`);
                    metadata = await generateVideoMetadata(file.name);
                }

                // Double check duplication with userId
                let videoRecord = await prisma.video.findUnique({
                    where: { driveId: file.id }
                });

                if (videoRecord) {
                    if (videoRecord.status === 'DRAFT' && !draftOnly) {
                        // Upgrading Draft to Processing
                        console.log(`[Automation] Upgrading DRAFT to PROCESSING: ${file.name}`);
                        videoRecord = await prisma.video.update({
                            where: { id: videoRecord.id },
                            data: {
                                status: 'PROCESSING',
                                title: metadata.title, // Update metadata if regenerated
                                description: metadata.description,
                                tags: metadata.tags.join(','),
                                transcript: transcript || videoRecord.transcript,
                                scheduledFor: scheduleTime,
                                jobId, // Update job ID association
                            }
                        });
                    } else {
                        console.log(`[Automation] Skipping duplicate: ${file.name}`);
                        result.details.push({
                            fileName: file.name,
                            status: 'skipped',
                        });
                        continue;
                    }
                } else {
                    // Create record in database
                    videoRecord = await prisma.video.create({
                        data: {
                            userId, // Link to user
                            jobId,  // Link to specific job if provided
                            driveId: file.id,
                            fileName: file.name,
                            status: draftOnly ? 'DRAFT' : 'PROCESSING',
                            title: metadata.title,
                            description: metadata.description,
                            tags: metadata.tags.join(','),
                            transcript: transcript,
                            scheduledFor: draftOnly ? null : scheduleTime,
                        },
                    });
                }

                // If draftOnly, stop here
                if (draftOnly) {
                    result.details.push({
                        fileName: file.name,
                        status: 'skipped',
                    });
                    continue;
                }

                // Download file from Drive
                const videoStream = await downloadFile(accessToken, file.id);

                // Upload to YouTube
                // NOTE: If using customScheduleTime, we set publishAt.
                const uploadResult = await uploadVideo({
                    accessToken,
                    videoStream,
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags,
                    privacyStatus: immediate ? 'public' : 'private',
                    publishAt: scheduleTime ? scheduleTime.toISOString() : undefined,
                });

                if (uploadResult.success && uploadResult.videoId) {

                    let finalStatus = 'UPLOADED';
                    let safetyError: string | undefined;

                    // SAFETY CHECK: Verify video has no restrictions
                    // Only run this if we intended to schedule it (not immediate public)
                    try {
                        console.log(`[Automation] Video ${uploadResult.videoId} uploaded. Waiting 15s for safety check...`);
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        const safetyCheck = await getVideoStatus(accessToken, uploadResult.videoId);
                        console.log(`[Automation] Safety check result for ${uploadResult.videoId}:`, JSON.stringify(safetyCheck, null, 2));

                        if (safetyCheck.success && safetyCheck.hasRestrictions) {
                            console.warn(`[Automation] Video ${file.name} has restrictions. Reverting to PRIVATE (Unscheduled).`);

                            await updateVideoVisibility(accessToken, uploadResult.videoId, 'private');

                            finalStatus = 'RESTRICTED';
                            safetyError = 'Restricted (Copyright/Policy)';
                        }
                    } catch (err) {
                        console.error('[Automation] Safety check failed', err);
                    }

                    // Update record with success
                    await prisma.video.update({
                        where: { id: videoRecord.id },
                        data: {
                            status: finalStatus,
                            youtubeId: uploadResult.videoId,
                            uploadedAt: new Date(),
                            scheduledFor: finalStatus === 'RESTRICTED' ? null : scheduleTime,
                        },
                    });

                    result.uploaded++;
                    result.details.push({
                        fileName: file.name,
                        status: 'uploaded',
                        youtubeId: uploadResult.videoId,
                        error: safetyError
                    });
                } else {
                    // Update record with failure
                    await prisma.video.update({
                        where: { id: videoRecord.id },
                        data: { status: 'FAILED' },
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
    userId: string,
    accessToken: string,
    driveFolderLink: string
): Promise<number> {
    const folderId = extractFolderId(driveFolderLink);
    if (!folderId) return 0;

    try {
        const driveFiles = await listVideosFromFolder(accessToken, folderId);
        const existingVideos = await prisma.video.findMany({
            where: { userId },
            select: { driveId: true },
        });
        const processedIds = new Set(existingVideos.map((v: { driveId: string }) => v.driveId));

        return driveFiles.filter((f: { id: string }) => !processedIds.has(f.id)).length;
    } catch {
        return 0;
    }
}
