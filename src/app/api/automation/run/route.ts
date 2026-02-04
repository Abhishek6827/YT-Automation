import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { runAutomation, getPendingCount } from '@/lib/services/automation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/automation/run - Run automation manually
export async function POST(req: Request) {
    let accessToken: string | undefined;

    // Legacy Cron Check - Redirect to new cron handler
    const authHeader = req.headers.get('authorization');
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ message: 'Please use /api/cron/schedule for cron jobs' });
    }

    // Manual Run (User Session)
    const session = await auth();
    console.log('[Automation POST] session:', { userId: session?.user?.id, hasAccessToken: !!session?.accessToken, error: session?.error });

    let effectiveUserId: string | undefined = session?.user?.id;
    if (!effectiveUserId && session?.accessToken) {
        try {
            const account = await prisma.account.findFirst({ where: { access_token: session.accessToken } });
            if (account?.userId) {
                effectiveUserId = account.userId;
            }
        } catch (e) {
            console.error('[Automation POST] Error looking up account by access token:', e);
        }
    }

    if (!effectiveUserId || !session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    accessToken = session!.accessToken;
    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized - No Access Token' }, { status: 401 });
    }

    const userId = session!.user!.id!;

    try {
        // Parse request body
        const body = await req.json();
        const draftOnly = body?.draftOnly === true;
        const immediate = body?.immediate === true;
        const limit = body?.limit && typeof body.limit === 'number' && body.limit > 0 ? body.limit : 1;
        const driveFolderLink = body?.driveFolderLink;
        const uploadHour = body?.newDailyScheduleHour || 10; // Default or from param

        let scheduleTime: Date | undefined;
        if (body?.scheduleTime) {
            scheduleTime = new Date(body.scheduleTime);
            if (isNaN(scheduleTime.getTime())) {
                scheduleTime = undefined;
            }
        }

        if (!driveFolderLink) {
            return NextResponse.json({ error: 'Drive folder link is required' }, { status: 400 });
        }

        const jobId = body?.jobId;

        console.log(`[Automation] Manual Run - User: ${userId}, Limit: ${limit}, Drive: ${driveFolderLink}, Draft: ${draftOnly}, Immediate: ${immediate}, JobId: ${jobId}`);

        // Run automation
        // Note: runAutomation signature might need to be verified, but based on previous code it matches order
        const result = await runAutomation(
            userId,
            accessToken,
            driveFolderLink,
            limit,
            uploadHour,
            draftOnly,
            scheduleTime,
            immediate,
            jobId
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
    if (!session?.user?.id || !session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const accessToken = session.accessToken;

    try {
        // Fetch all enabled automation jobs
        const jobs = await prisma.automationJob.findMany({
            where: {
                userId,
                enabled: true
            }
        });

        if (jobs.length === 0) {
            // Also check legacy/migrated settings if needed? No, let's assume migration or fresh start.
            return NextResponse.json({
                pendingCount: 0,
                totalUploaded: 0,
                configured: false,
            });
        }

        let totalPending = 0;

        // Sum up pending counts from all jobs
        // We run this in parallel provided rate limits allow. Google API might rate limit.
        // Let's do sequential for safety or Promise.all with small tasks.
        const pendingPromises = jobs.map(job =>
            getPendingCount(userId, accessToken, job.driveFolderLink)
                .catch(e => {
                    console.error(`Failed to get count for job ${job.name}:`, e);
                    return 0;
                })
        );

        const counts = await Promise.all(pendingPromises);
        totalPending = counts.reduce((a, b) => a + b, 0);

        const totalUploaded = await prisma.video.count({
            where: {
                userId,
                status: 'UPLOADED'
            },
        });

        return NextResponse.json({
            pendingCount: totalPending,
            totalUploaded,
            configured: true,
        });
    } catch (error) {
        console.error('Status error:', error);
        return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
    }
}
