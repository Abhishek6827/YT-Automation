import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { runAutomation } from '@/lib/services/automation';

// This endpoint is designed to be called by Vercel Cron or external scheduler
// GET /api/cron/schedule - Daily scheduled upload

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret for security (optional but recommended)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            // For development/testing, allow without secret
            console.log('[Cron] Warning: No CRON_SECRET configured or mismatch');
        }

        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json(
                { error: 'No active session - user needs to be logged in' },
                { status: 401 }
            );
        }

        // Get settings for this user
        const settings = await prisma.settings.findUnique({
            where: { userId: session.user?.id }
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json(
                { error: 'No Drive folder configured' },
                { status: 400 }
            );
        }

        // Check current hour against upload hour setting
        const currentHour = new Date().getHours();
        const uploadHour = settings.uploadHour;

        // For testing, allow anytime. In production, check hour.
        const isTestMode = request.nextUrl.searchParams.get('test') === 'true';

        if (!isTestMode && currentHour !== uploadHour) {
            return NextResponse.json({
                message: `Skipping - current hour (${currentHour}) doesn't match upload hour (${uploadHour})`,
                nextRun: `${uploadHour}:00`,
            });
        }

        console.log(`[Cron] Running scheduled upload - limit: ${settings.videosPerDay}`);

        // Run automation with daily limit
        const result = await runAutomation(
            session.user?.id as string,
            session.accessToken,
            settings.driveFolderLink,
            settings.videosPerDay,
            settings.uploadHour,
            false // Not draft only - actually upload
        );

        return NextResponse.json({
            success: true,
            scheduled: true,
            ...result,
        });
    } catch (error) {
        console.error('[Cron] Scheduled upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Cron job failed' },
            { status: 500 }
        );
    }
}
