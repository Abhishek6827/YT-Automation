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
    console.log('[Automation POST] session:', { userId: session?.user?.id, hasAccessToken: !!session?.accessToken, error: session?.error });
    // Resolve effective userId: prefer session.user.id but fall back to Account lookup using access token
    let effectiveUserId: string | undefined = session?.user?.id;
    if (!effectiveUserId && session?.accessToken) {
        try {
            const account = await prisma.account.findFirst({ where: { access_token: session.accessToken } });
            if (account?.userId) {
                effectiveUserId = account.userId;
                console.log('[Automation POST] Resolved userId from Account via access_token:', effectiveUserId);
            }
        } catch (e) {
            console.error('[Automation POST] Error looking up account by access token:', e);
        }
    }

    if (!effectiveUserId || !session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For manual run, verify active token
    // Note: session.accessToken might be expired if session is old, but NextAuth usually handles refreshing?
    // In this repo, session.accessToken seems to be passed from auth().
    accessToken = session!.accessToken;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized - No Access Token' }, { status: 401 });
    }

    // Safe to access session.user.id now
    const userId = session!.user!.id!;

    try {
        // Get settings for this user
        const settings = await prisma.settings.findUnique({
            where: { userId },
        });

        // Parse request body
        let draftOnly = false;
        let limit = 1;
        let scheduleTime: Date | undefined;
        let providedDriveLink: string | undefined;
        let immediate = false;

        try {
            const body = await req.json();
            draftOnly = body?.draftOnly === true;
            providedDriveLink = body?.driveFolderLink;
            immediate = body?.immediate === true;

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

        // Use provided link or fallback to saved settings
        const effectiveDriveLink = providedDriveLink || settings?.driveFolderLink;

        if (!effectiveDriveLink) {
            return NextResponse.json({ error: 'Please configure Google Drive folder link first' }, { status: 400 });
        }

        // If a new link is provided, save it to settings for future convenience
        if (providedDriveLink && providedDriveLink !== settings?.driveFolderLink) {
            try {
                // Use explicit update/create to avoid potential P2002 race conditions with upsert on some Prisma versions/drivers
                const existingSettings = await prisma.settings.findUnique({ where: { userId } });
                if (existingSettings) {
                    await prisma.settings.update({
                        where: { userId },
                        data: { driveFolderLink: providedDriveLink }
                    });
                } else {
                    await prisma.settings.create({
                        data: {
                            userId,
                            driveFolderLink: providedDriveLink,
                            uploadHour: 10,
                            videosPerDay: 1
                        }
                    });
                }
                console.log(`[Automation] Updated drive link for user ${userId}`);
            } catch (dbError) {
                console.warn('[Automation] Note: Failed to save new drive link preference (non-critical):', dbError instanceof Error ? dbError.message : 'Unknown DB error');
                // Continue execution
            }
        }

        console.log(`[Automation] Manual Run - User: ${userId}, Limit: ${limit}, Draft: ${draftOnly}, Schedule: ${scheduleTime}, Immediate: ${immediate}`);

        // Run automation
        const result = await runAutomation(
            userId,
            accessToken,
            effectiveDriveLink,
            limit,
            settings?.uploadHour || 10,
            draftOnly,
            scheduleTime,
            immediate
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
    console.log('[Automation GET] session:', { userId: session?.user?.id, hasAccessToken: !!session?.accessToken, error: session?.error });
    let effectiveUserId: string | undefined = session?.user?.id;
    if (!effectiveUserId && session?.accessToken) {
        try {
            const account = await prisma.account.findFirst({ where: { access_token: session.accessToken } });
            if (account?.userId) {
                effectiveUserId = account.userId;
                console.log('[Automation GET] Resolved userId from Account via access_token:', effectiveUserId);
            }
        } catch (e) {
            console.error('[Automation GET] Error looking up account by access token:', e);
        }
    }

    if (!effectiveUserId || !session?.accessToken || !session.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Now we can safely assert session.user.id because we checked it above
    const userId = session.user.id;
    const accessToken = session.accessToken;

    try {
        const settings = await prisma.settings.findUnique({
            where: { userId },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({
                pendingCount: 0,
                totalUploaded: 0,
                configured: false,
            });
        }

        const pendingCount = await getPendingCount(
            userId,
            accessToken,
            settings.driveFolderLink
        );

        const totalUploaded = await prisma.video.count({
            where: {
                userId,
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
