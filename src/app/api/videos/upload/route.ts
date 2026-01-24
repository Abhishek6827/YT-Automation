
import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downloadFile } from '@/lib/services/drive';
import { uploadVideo } from '@/lib/services/youtube';

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

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const video of videosToUpload) {
            try {
                // Download from Drive
                const videoStream = await downloadFile(accessToken, video.driveId);

                // Upload to YouTube
                // Use stored metadata or fallback to filename if empty (should have metadata by now)
                const uploadResult = await uploadVideo({
                    accessToken,
                    videoStream,
                    title: video.title || video.fileName,
                    description: video.description || '',
                    tags: video.tags ? video.tags.split(',') : [],
                    privacyStatus: 'private', // Default to private for review
                    // No publishAt here, simplified immediate upload
                });

                if (uploadResult.success && uploadResult.videoId) {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            status: 'UPLOADED',
                            youtubeId: uploadResult.videoId,
                            uploadedAt: new Date(),
                        }
                    });
                    results.push({ id: video.id, status: 'success', videoId: uploadResult.videoId });
                    successCount++;
                } else {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: { status: 'FAILED' }
                    });
                    results.push({ id: video.id, status: 'failed', error: uploadResult.error });
                    failCount++;
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
