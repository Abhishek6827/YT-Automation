import { prisma } from '@/lib/db';
import { listVideosFromFolder, downloadFile, extractFolderId, downloadFileBuffer, getFileMetadata, DriveFile } from '@/lib/services/drive';
import { generateVideoMetadata, generateMetadataFromTranscript, generateMetadataFromVisuals } from '@/lib/services/ai';
import { uploadVideo, getVideoStatus, updateVideoVisibility } from '@/lib/services/youtube';
import { uploadAndTranscribe } from '@/lib/services/assemblyai';
import { extractFrames } from '@/lib/services/video';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
    // Logic: Treat uploadHour as the user's desired hour in UTC for simplicity or convert?
    // User expectation: "8:30 PM".  If they input "20" (20:00) or "20.5" (20:30).
    // Let's assume input is 0-23 representing hour.
    // We want to schedule it for TODAY if possible, or TOMORROW.

    // For the "Early Processing" workflow (running at 5:30 AM IST):
    // We want to schedule for the SAME DAY at uploadHour.

    // Create date for TODAY at uploadHour
    const todaySchedule = new Date();
    todaySchedule.setUTCHours(uploadHour, 0, 0, 0);

    // If we are running this logic, we generally want the next valid slot.
    // If todaySchedule is already past (e.g. running manually at 10 PM for a 8 PM slot), schedule for tomorrow.
    // But for the Cron running at 5:30 AM (00:00 UTC), todaySchedule (e.g. 15:00 UTC = 8:30 PM IST) is in future.

    // NOTE: uploadHour might need to be adjusted if it's stored as IST hour but setUTCHours expects UTC.
    // Current setup: uploadHour is stored as integer.
    // If user wants 8:30 PM IST (20:30 IST), that is 15:00 UTC.
    // If the input `uploadHour` is 15 (UTC), we set UTC 15.
    // Check Dashboard frontend to see what it sends. Dashboard sends `20.5` for 8:30 PM? Or just `20`?
    // Code in Dashboard: `uploadHour: parseInt(value)` -> sends integer.
    // If user selects "20" (8 PM), and thinks it's IST, that's 14:30 UTC.
    // Let's stick to existing logic but ensure it targets the correct future time.

    if (todaySchedule <= new Date()) {
        todaySchedule.setDate(todaySchedule.getDate() + 1);
    }

    baseDate = todaySchedule;

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

                if (metadata && transcript) {
                    // We have a transcript, stick with it
                } else {
                    // Try Visual Analysis if transcript failed or wasn't attempted
                    console.log(`[Automation] No transcript available, attempting Visual Analysis for: ${file.name}`);
                    try {
                        // We need the full file for ffmpeg processing
                        const stream = await downloadFile(accessToken, file.id);

                        // Save to temp file
                        const tempPath = path.join(os.tmpdir(), `yt-temp-${file.id}-${Date.now()}.mp4`);
                        const writeStream = fs.createWriteStream(tempPath);

                        await new Promise<void>((resolve, reject) => {
                            stream.pipe(writeStream);
                            writeStream.on('finish', () => resolve());
                            writeStream.on('error', reject);
                        });

                        // Extract frames
                        const frames = await extractFrames(tempPath, 3);

                        // Generate metadata
                        if (frames.length > 0) {
                            metadata = await generateMetadataFromVisuals(frames, file.name);
                        }

                        // Cleanup temp file
                        fs.unlink(tempPath, (err: NodeJS.ErrnoException | null) => {
                            if (err) console.error('[Automation] Error deleting temp video file:', err);
                        });

                    } catch (visualError) {
                        console.error('[Automation] Visual analysis failed:', visualError);
                    }
                }

                // Fallback to filename-based generation if both transcript and visual failed
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
                // For Early Processing workflow: immediate=false, calculate scheduleTime (e.g. 8:30 PM today)
                // We assume scheduleTime is correctly calculated above.
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
                        console.log(`[Automation] Video ${uploadResult.videoId} uploaded. Waiting for processing to complete...`);

                        // Poll for processing completion (max 2 minutes)
                        let safetyCheck;
                        let attempts = 0;
                        const maxAttempts = 24; // 24 * 5s = 120s

                        while (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s between checks
                            safetyCheck = await getVideoStatus(accessToken, uploadResult.videoId);

                            console.log(`[Automation] Check ${attempts + 1}/${maxAttempts}: Status=${safetyCheck.uploadStatus}`);

                            if (safetyCheck.uploadStatus === 'processed' || safetyCheck.uploadStatus === 'failed' || safetyCheck.uploadStatus === 'rejected') {
                                break;
                            }
                            attempts++;
                        }

                        if (!safetyCheck) safetyCheck = await getVideoStatus(accessToken, uploadResult.videoId);
                        console.log(`[Automation] Final Safety Check for ${uploadResult.videoId}:`, JSON.stringify(safetyCheck, null, 2));

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
