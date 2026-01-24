import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { runAutomation, getPendingCount } from '@/lib/services/automation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/automation/run - Run automation manually or via Cron
export async function POST(req: Request) {
    let accessToken: string | undefined;

    // Check if triggered by Cron (Vercel Cron)
    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (isCron) {
        console.log('Cron job execution triggered');

        try {
            // Find all unique users who have settings configured (driveFolderLink exists)
            const allSettings = await prisma.settings.findMany({
                where: {
                    driveFolderLink: { not: null },
                    userId: { not: undefined }
                },
                include: {
                    user: {
                        include: {
                            accounts: {
                                where: { provider: 'google' }
                            }
                        }
                    }
                }
            });

            console.log(`[Cron] Found ${allSettings.length} users with configured settings`);
            const results = [];

            // Iterate over each user and run automation
            for (const setting of allSettings) {
                const user = setting.user;
                if (!user || !user.accounts[0]?.refresh_token) {
                    console.log(`[Cron] Skipping user ${user?.id}: No Google account/refresh token`);
                    continue;
                }

                console.log(`[Cron] Processing user: ${user.id}`);

                // Refresh token for this user
                let accessToken: string | undefined;
                try {
                    const { google } = await import('googleapis');
                    const authClient = new google.auth.OAuth2(
                        process.env.GOOGLE_CLIENT_ID,
                        process.env.GOOGLE_CLIENT_SECRET
                    );
                    authClient.setCredentials({ refresh_token: user.accounts[0].refresh_token });
                    const { credentials } = await authClient.refreshAccessToken();
                    accessToken = credentials.access_token || undefined;
                } catch (refreshError) {
                    console.error(`[Cron] Failed to refresh token for user ${user.id}:`, refreshError);
                    continue;
                }

                if (!accessToken) continue;

                // Run automation for this user
                const result = await runAutomation(
                    user.id,
                    accessToken,
                    setting.driveFolderLink!,
                    setting.videosPerDay,
                    setting.uploadHour
                );

                results.push({ userId: user.id, result });
            }

            return NextResponse.json({ success: true, processedUsers: results.length, details: results });
        } catch (error) {
            console.error('Cron job failure:', error);
            return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
        }
    }

    // Manual Run (User Session)
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For manual run, verify active token
    // Note: session.accessToken might be expired if session is old, but NextAuth usually handles refreshing?
    // In this repo, session.accessToken seems to be passed from auth().
    accessToken = session.accessToken;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized - No Access Token' }, { status: 401 });
    }

    try {
        // Get settings for this user
        const settings = await prisma.settings.findUnique({
            where: { userId: session.user.id },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({ error: 'Please configure Google Drive folder link first' }, { status: 400 });
        }

        // Parse request body
        let draftOnly = false;
        let limit = 1;
        let scheduleTime: Date | undefined;
        let bodyLink: string | undefined;

        try {
            const body = await req.json();
            draftOnly = body?.draftOnly === true;
            bodyLink = body?.driveFolderLink;

            if (body?.limit && typeof body.limit === 'number' && body.limit > 0) {
                limit = body.limit;
            } else {
                limit = settings?.videosPerDay || 1;
            }

            // Parse scheduleTime if present
            if (body?.scheduleTime) {
                scheduleTime = new Date(body.scheduleTime);
                if (isNaN(scheduleTime.getTime())) {
                    scheduleTime = undefined;
                }
            }
        } catch (parseError) {
            limit = settings?.videosPerDay || 1;
        }

        const effectiveLink = bodyLink || settings?.driveFolderLink;

        if (!effectiveLink) {
            return NextResponse.json({ error: 'Please configure Google Drive folder link first' }, { status: 400 });
        }

        console.log(`[Automation] Manual Run - User: ${session.user.id}, Limit: ${limit}, Draft: ${draftOnly}, Schedule: ${scheduleTime}`);

        // Run automation
        const result = await runAutomation(
            session.user.id,
            accessToken,
            effectiveLink,
            limit,
            settings?.uploadHour || 10,
            draftOnly,
            scheduleTime
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
    if (!session?.user?.id || !session.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const settings = await prisma.settings.findUnique({
            where: { userId: session.user.id },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({
                pendingCount: 0,
                totalUploaded: 0,
                configured: false,
            });
        }

        const pendingCount = await getPendingCount(
            session.user.id,
            session.accessToken,
            settings.driveFolderLink
        );

        const totalUploaded = await prisma.video.count({
            where: {
                userId: session.user.id,
                status: 'UPLOADED'
            },
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
