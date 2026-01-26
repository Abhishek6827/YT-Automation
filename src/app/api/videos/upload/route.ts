
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/services/drive';
import { uploadVideo, getVideoStatus, updateVideoVisibility } from '@/lib/services/youtube';
import { getNextScheduleTime } from '@/lib/services/automation';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const session = await auth();
    const userId = session?.user?.id;
    const accessToken = session?.accessToken;

    if (!userId || !accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { videoIds } = body;

        if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
            return NextResponse.json({ error: 'No videos selected' }, { status: 400 });
        }

        // Get videos from DB that belong to this user and are in PENDING or DRAFT status
        const videosToUpload = await prisma.video.findMany({
            where: {
                id: { in: videoIds },
                userId: userId,
                status: { in: ['PENDING', 'DRAFT'] }
            }
        });

        if (videosToUpload.length === 0) {
            return NextResponse.json({ error: 'No eligible videos found to upload' }, { status: 404 });
        }

        // Get user settings for scheduling
        const settings = await prisma.settings.findUnique({
            where: { userId }
        });
        const uploadHour = settings?.uploadHour || 10;
        const videosPerDay = settings?.videosPerDay || 1;

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const video of videosToUpload) {
            try {
                // Download from Drive
                const videoStream = await downloadFile(accessToken, video.driveId);

                // Determining Schedule:
                // If the video already has a schedule (that is in the future), keep it.
                // If it has NO schedule (or it's in the past/null), calculate a new one based on Settings.
                let scheduleTime = video.scheduledFor;
                let isScheduled = scheduleTime && new Date(scheduleTime) > new Date();

                if (!isScheduled) {
                    // Calculate next available slot
                    const newSchedule = await getNextScheduleTime(userId, uploadHour, videosPerDay);
                    console.log(`[Upload] Auto-scheduling video ${video.id} for ${newSchedule.toISOString()}`);

                    // Update DB with new schedule
                    await prisma.video.update({
                        where: { id: video.id },
                        data: { scheduledFor: newSchedule }
                    });

                    scheduleTime = newSchedule;
                    isScheduled = true;
                }

                // Determine privacy
                const privacyStatus = isScheduled ? 'private' : 'public';
                const publishAt = isScheduled && scheduleTime ? new Date(scheduleTime).toISOString() : undefined;

                const uploadResult = await uploadVideo({
                    accessToken,
                    videoStream,
                    title: video.title || video.fileName,
                    description: video.description || '',
                    tags: video.tags ? video.tags.split(',') : [],
                    privacyStatus: privacyStatus,
                    publishAt: publishAt,
                });

                if (uploadResult.success && uploadResult.videoId) {

                    // SAFETY CHECK: Verify video has no restrictions
                    // Restrictions like "Shorts policy" or copyright claims should prevent auto-scheduling
                    let finalStatus = 'UPLOADED';
                    let safetyError: string | undefined;

                    try {
                        // Check status immediately
                        const safetyCheck = await getVideoStatus(accessToken, uploadResult.videoId);

                        if (safetyCheck.success && safetyCheck.hasRestrictions) {
                            console.warn(`[Upload] Video ${video.id} has restrictions. Reverting to PRIVATE (Unscheduled).`);

                            // Revert to Private (Unscheduled) by clearing publishAt (schedule)
                            await updateVideoVisibility(accessToken, uploadResult.videoId, 'private');

                            finalStatus = 'RESTRICTED';
                            safetyError = 'Restricted (Copyright/Policy)';

                            // Clear schedule variable so it's recorded as null
                            scheduleTime = null;
                        }
                    } catch (err) {
                        console.error('Safety check failed', err);
                    }

                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            status: finalStatus,
                            youtubeId: uploadResult.videoId,
                            uploadedAt: new Date(),
                            // Ensure schedule is persisted if it wasn't already, OR cleared if restricted
                            scheduledFor: finalStatus === 'RESTRICTED' ? null : scheduleTime
                        }
                    });

                    results.push({
                        id: video.id,
                        status: safetyError ? 'restricted' : 'success',
                        videoId: uploadResult.videoId,
                        scheduledFor: finalStatus === 'RESTRICTED' ? null : scheduleTime,
                        error: safetyError
                    });
                    successCount++;
                } else {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: { status: 'FAILED' }
                    });
                    results.push({ id: video.id, status: 'failed', error: uploadResult.error });
                    failCount++;

                    // If we hit a quota limit, stop trying to upload the rest
                    if (uploadResult.isQuotaError) {
                        console.warn('[Bulk Upload] Stopping batch due to Quota Error');
                        break;
                    }
                }

            } catch (error) {
                console.error(`Error uploading video ${video.id}:`, error);
                results.push({ id: video.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            successCount,
            failCount,
            results
        });

    } catch (error) {
        console.error('Bulk upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
