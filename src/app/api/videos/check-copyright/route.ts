import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getVideoStatus, updateVideoVisibility } from '@/lib/services/youtube';

// POST /api/videos/check-copyright - Check copyright status and update visibility
export async function POST() {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find videos uploaded more than 24 hours ago with PENDING copyright status
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const videosToCheck = await prisma.video.findMany({
            where: {
                status: 'UPLOADED',
                copyrightStatus: 'PENDING',
                youtubeId: { not: null },
                uploadedAt: { lt: twentyFourHoursAgo },
            },
            take: 10, // Process 10 at a time to avoid rate limits
        });

        console.log(`[Copyright] Found ${videosToCheck.length} videos to check`);

        const results = {
            checked: 0,
            madePublic: 0,
            flagged: 0,
            errors: [] as string[],
        };

        for (const video of videosToCheck) {
            if (!video.youtubeId) continue;

            try {
                // Check video status on YouTube
                const statusResult = await getVideoStatus(session.accessToken, video.youtubeId);

                if (!statusResult.success) {
                    results.errors.push(`Failed to check ${video.fileName}: ${statusResult.error}`);
                    continue;
                }

                results.checked++;

                // Log the check
                await prisma.copyrightLog.create({
                    data: {
                        videoId: video.id,
                        youtubeId: video.youtubeId,
                        claimType: statusResult.copyrightInfo?.hasClaims ? 'claim' : null,
                        claimStatus: statusResult.status || null,
                        claimDetails: JSON.stringify(statusResult.copyrightInfo),
                    },
                });

                if (statusResult.copyrightInfo?.hasClaims) {
                    // Has copyright claims - keep private and flag
                    await updateVideoVisibility(session.accessToken, video.youtubeId, 'private');
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            copyrightStatus: 'CLAIMED',
                            visibility: 'private',
                            copyrightCheckedAt: new Date(),
                        },
                    });
                    results.flagged++;
                    console.log(`[Copyright] Video ${video.fileName} flagged for copyright`);
                } else {
                    // No claims - make public
                    await updateVideoVisibility(session.accessToken, video.youtubeId, 'public');
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            copyrightStatus: 'CLEAR',
                            visibility: 'public',
                            copyrightCheckedAt: new Date(),
                        },
                    });
                    results.madePublic++;
                    console.log(`[Copyright] Video ${video.fileName} made public`);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                results.errors.push(`Error processing ${video.fileName}: ${errorMsg}`);
            }
        }

        return NextResponse.json({
            success: true,
            ...results,
        });
    } catch (error) {
        console.error('[Copyright] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to check copyright' },
            { status: 500 }
        );
    }
}

// GET /api/videos/check-copyright - Get copyright status summary
export async function GET() {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [pending, clear, claimed] = await Promise.all([
            prisma.video.count({ where: { copyrightStatus: 'PENDING', status: 'UPLOADED' } }),
            prisma.video.count({ where: { copyrightStatus: 'CLEAR' } }),
            prisma.video.count({ where: { copyrightStatus: 'CLAIMED' } }),
        ]);

        // Get videos flagged for copyright
        const flaggedVideos = await prisma.video.findMany({
            where: { copyrightStatus: 'CLAIMED' },
            select: {
                id: true,
                fileName: true,
                youtubeId: true,
                copyrightCheckedAt: true,
            },
        });

        return NextResponse.json({
            pending,
            clear,
            claimed,
            flaggedVideos,
        });
    } catch (error) {
        console.error('[Copyright] Error getting status:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get status' },
            { status: 500 }
        );
    }
}
