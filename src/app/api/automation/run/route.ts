import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { runAutomation, getPendingCount } from '@/lib/services/automation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/automation/run - Run automation manually
export async function POST() {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized - Please sign in with Google' }, { status: 401 });
    }

    try {
        // Get settings
        const settings = await prisma.settings.findFirst({
            where: { id: 1 },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({ error: 'Please configure Google Drive folder link first' }, { status: 400 });
        }

        // Run automation
        const result = await runAutomation(
            session.accessToken,
            settings.driveFolderLink,
            settings.videosPerDay
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Automation error:', error);
        return NextResponse.json({ error: 'Automation failed' }, { status: 500 });
    }
}

// GET /api/automation/status - Get automation status
export async function GET() {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const settings = await prisma.settings.findFirst({
            where: { id: 1 },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({
                pendingCount: 0,
                totalUploaded: 0,
                configured: false,
            });
        }

        const pendingCount = await getPendingCount(
            session.accessToken,
            settings.driveFolderLink
        );

        const totalUploaded = await prisma.video.count({
            where: { status: 'UPLOADED' },
        });

        return NextResponse.json({
            pendingCount,
            totalUploaded,
            configured: true,
        });
    } catch (error) {
        console.error('Status error:', error);
        return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
    }
}
