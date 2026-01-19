import { prisma } from '@/lib/db';
import { listVideosFromFolder, downloadFile, extractFolderId, downloadFileBuffer } from '@/lib/services/drive';
import { generateVideoMetadata, generateMetadataFromTranscript } from '@/lib/services/ai';
import { uploadVideo } from '@/lib/services/youtube';
import { transcribeAudio, uploadForTranscription } from '@/lib/services/whisper';

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
async function getNextScheduleTime(uploadHour: number, videosPerDay: number): Promise<Date> {
    // Get the last scheduled video
    const lastScheduled = await prisma.video.findFirst({
        where: {
            scheduledFor: {
                not: null
            }
        },
        orderBy: {
            scheduledFor: 'desc'
        }
    });

    let baseDate = new Date();

    // If we have a scheduled video, check if we can fit more on that day
    if (lastScheduled?.scheduledFor) {
        const lastDate = new Date(lastScheduled.scheduledFor);

        // Count videos scheduled for that specific date
        const startOfLastDate = new Date(lastDate);
        startOfLastDate.setHours(0, 0, 0, 0);

        const endOfLastDate = new Date(lastDate);
        endOfLastDate.setHours(23, 59, 59, 999);

        const countOnLastDate = await prisma.video.count({
            where: {
                scheduledFor: {
                    gte: startOfLastDate,
                    lte: endOfLastDate
                }
            }
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
        // No previously scheduled videos. Start from effective "Tomorrow" if current time > upload hour?
        // Or just today if we haven't passed upload hour?
        // User wants "Schedule". Usually means future. 
        // Let's default to Tomorrow @ UploadHour to be safe, or Today if hour is available.
        // Current logic: Just set hours.
        const now = new Date();
        baseDate.setHours(uploadHour, 0, 0, 0);

        if (baseDate <= now) {
            baseDate.setDate(baseDate.getDate() + 1);
        }
    }

    // Ensure strict hour setting (in case baseDate was shifted)
    baseDate.setHours(uploadHour, 0, 0, 0);

    return baseDate;
}

export async function runAutomation(
    accessToken: string,
    driveFolderLink: string,
    limit: number = 1,
    uploadHour: number = 10,
    draftOnly: boolean = false  // New: If true, only create drafts with AI metadata
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

        console.log(`[Automation] Total new files: ${newFiles.length}, limit: ${limit}, will process: ${Math.min(newFiles.length, limit)}`);

        // Process up to 'limit' files
        const filesToProcess = newFiles.slice(0, limit);

        for (const file of filesToProcess) {
            result.processed++;

            // Calculate Schedule Time
            // We re-calculate for EACH file to handle the increment logic correctly
            // (getNextScheduleTime queries DB, but we haven't saved the record yet?)
            // Wait, we need to save the record or pass the previous date.
            // Better: Calculate in loop.
            // Actually, querying DB inside loop is slow but safe.
            // But we insert the record as PROCESSING first.
            // Let's determine schedule time BEFORE processing loop?
            // No, strictly sequential. 

            const scheduleTime = await getNextScheduleTime(uploadHour, limit); // Pass limit as videosPerDay approx?
            // Wait, getNextScheduleTime uses 'limit' as 'videosPerDay'? 
            // In route.ts, limit PASSED IS settings.videosPerDay.
            // So logic inside getNextScheduleTime is correct.

            try {
                // Generate metadata using AI - try Whisper transcription first
                let metadata;
                let transcript: string | null = null;

                // Attempt Whisper transcription if REPLICATE_API_TOKEN is set
                const hasReplicateToken = !!process.env.REPLICATE_API_TOKEN;
                console.log(`[Automation] REPLICATE_API_TOKEN configured: ${hasReplicateToken}`);

                if (hasReplicateToken) {
                    console.log(`[Automation] Attempting quick transcription for: ${file.name}`);
                    try {
                        // Quick transcription with 8-second timeout (Vercel Hobby has 10s limit)
                        const transcriptionPromise = (async () => {
                            // Download only 1MB of video (first few seconds of audio)
                            const videoBuffer = await downloadFileBuffer(accessToken, file.id, 1 * 1024 * 1024);

                            if (videoBuffer && videoBuffer.length > 0) {
                                console.log(`[Automation] Downloaded ${videoBuffer.length} bytes for transcription`);
                                // Upload to Replicate for transcription
                                const fileUrl = await uploadForTranscription(videoBuffer, file.name);

                                if (fileUrl) {
                                    console.log(`[Automation] File uploaded to Replicate, starting Whisper...`);
                                    // Transcribe with Whisper
                                    const result = await transcribeAudio(fileUrl);
                                    return result;
                                }
                            }
                            return { success: false, error: 'Failed to prepare file' };
                        })();

                        // 8 second timeout (leaving 2s buffer for Vercel's 10s limit)
                        const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
                            setTimeout(() => resolve({ success: false, error: 'Transcription timed out (8s limit for Vercel Hobby)' }), 8000);
                        });

                        const transcriptionResult = await Promise.race([transcriptionPromise, timeoutPromise]);

                        if (transcriptionResult.success && transcriptionResult.transcript) {
                            transcript = transcriptionResult.transcript;
                            console.log(`[Automation] Transcription successful: ${transcript.slice(0, 100)}...`);
                            // Generate metadata from transcript
                            metadata = await generateMetadataFromTranscript(transcript, file.name);
                        } else {
                            console.log(`[Automation] Transcription failed: ${transcriptionResult.error}`);
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

                // Use upsert to prevent duplicate records (in case of race condition with concurrent requests)
                // If driveId already exists, we skip creating a new record
                const existingCheck = await prisma.video.findUnique({
                    where: { driveId: file.id }
                });

                if (existingCheck) {
                    console.log(`[Automation] Skipping duplicate: ${file.name} (driveId: ${file.id} already exists)`);
                    result.details.push({
                        fileName: file.name,
                        status: 'skipped',
                    });
                    continue;
                }

                // Create record in database (including transcript if available)
                const videoRecord = await prisma.video.create({
                    data: {
                        driveId: file.id,
                        fileName: file.name,
                        status: draftOnly ? 'DRAFT' : 'PROCESSING',
                        title: metadata.title,
                        description: metadata.description,
                        tags: metadata.tags.join(','),
                        transcript: transcript, // Store transcript for display in UI
                        scheduledFor: draftOnly ? null : scheduleTime,
                    },
                });

                console.log(`[Automation] Created video record: ${videoRecord.id}, transcript: ${transcript ? 'YES' : 'NO'}`);

                // If draftOnly, stop here - don't download or upload
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
                const uploadResult = await uploadVideo({
                    accessToken,
                    videoStream,
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags,
                    privacyStatus: 'private', // Start with private for safety
                    publishAt: scheduleTime.toISOString(), // Schedule it!
                });

                if (uploadResult.success && uploadResult.videoId) {
                    // Update record with success
                    await prisma.video.update({
                        where: { id: videoRecord.id },
                        data: {
                            status: 'UPLOADED', // Or SCHEDULED?
                            youtubeId: uploadResult.videoId,
                            uploadedAt: new Date(),
                            scheduledFor: scheduleTime,
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
