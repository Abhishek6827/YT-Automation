import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { runAutomation, getPendingCount } from '@/lib/services/automation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/automation/run - Run automation manually or via Cron
export async function POST(req: Request) {
    let accessToken: string | undefined;

    // Check if triggered by Cron (Vercel Cron)
    // Vercel sends `Authorization: Bearer <CRON_SECRET>` if configured.
    // Ideally we check common cron headers
    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (isCron) {
        console.log('Cron job execution triggered');
        // Fetch the first user account with Google provider to get refresh token
        // In a single-user app, this is the admin.
        const account = await prisma.account.findFirst({
            where: { provider: 'google' },
        });

        if (!account?.refresh_token) {
            return NextResponse.json({ error: 'No google account with refresh token found' }, { status: 401 });
        }

        // Refresh the token
        try {
            const { google } = await import('googleapis');
            const authClient = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            authClient.setCredentials({ refresh_token: account.refresh_token });
            const { credentials } = await authClient.refreshAccessToken();
            accessToken = credentials.access_token || undefined;
        } catch (error) {
            console.error('Failed to refresh token for cron:', error);
            return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
        }
    } else {
        // User session
        const session = await auth();
        accessToken = session?.accessToken;
    }

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        // If Cron context, we might want to respect different limits? 
        // For now, use settings.
        const result = await runAutomation(
            accessToken,
            settings.driveFolderLink,
            settings.videosPerDay,
            settings.uploadHour
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
