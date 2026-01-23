import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getVideoStatus, updateVideoVisibility } from '@/lib/services/youtube';

// Cron endpoint for checking copyright status
// GET /api/cron/copyright-check

export async function GET() {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json(
                { error: 'No active session - user needs to be logged in' },
                { status: 401 }
            );
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
            take: 10,
        });

        console.log(`[Cron/Copyright] Found ${videosToCheck.length} videos to check`);

        const results = {
            checked: 0,
            madePublic: 0,
            flagged: 0,
            errors: [] as string[],
        };

        for (const video of videosToCheck) {
            if (!video.youtubeId) continue;

            try {
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
                } else {
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
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                results.errors.push(`Error processing ${video.fileName}: ${errorMsg}`);
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...results,
        });
    } catch (error) {
        console.error('[Cron/Copyright] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Copyright check failed' },
            { status: 500 }
        );
    }
}
