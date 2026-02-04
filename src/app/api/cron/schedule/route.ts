import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runAutomation } from '@/lib/services/automation';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';


// This endpoint is designed to be called by Vercel Cron or external scheduler
// GET /api/cron/schedule - Hourly check for scheduled uploads

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

        if (!isCron) {
            // Optional: Fail if not cron, or just log
            console.log('[Cron] Warning: Request missing valid Authorization header');
        }

        console.log('[Cron] Execution started');

        // 1. Find all users with active automation jobs
        // We look for users who have at least one enabled job
        const userQuery = {
            where: {
                jobs: {
                    some: { enabled: true }
                },
                accounts: {
                    some: { provider: 'google' }
                }
            },
            include: {
                jobs: {
                    where: { enabled: true }
                },
                accounts: {
                    where: { provider: 'google' }
                }
            }
        };

        const usersWithJobs = await prisma.user.findMany(userQuery);

        console.log(`[Cron] Found ${usersWithJobs.length} users with active automations`);
        const results = [];
        const currentHour = new Date().getUTCHours();

        // 2. Iterate each user
        for (const user of usersWithJobs) {

            // Validate Token
            if (!user.accounts[0]?.refresh_token) {
                console.log(`[Cron] Skipping user ${user.id}: No Google account/refresh token`);
                continue;
            }

            // 3. Refresh Token (Once per user, used for all their jobs)
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

            // 4. Run All Automation Jobs for this User
            for (const job of user.jobs) {
                console.log(`[Cron] Processing job "${job.name}" for user ${user.id}`);
                try {
                    const result = await runAutomation(
                        user.id,
                        accessToken,
                        job.driveFolderLink,
                        job.videosPerDay,
                        job.uploadHour,
                        false,      // draftOnly
                        undefined,  // customScheduleTime
                        false,      // immediate
                        job.id      // jobId
                    );
                    results.push({ userId: user.id, jobId: job.id, success: true, result });
                } catch (runError) {
                    console.error(`[Cron] Job "${job.name}" failed for user ${user.id}:`, runError);
                    results.push({ userId: user.id, jobId: job.id, success: false, error: String(runError) });
                }
            }
        }

        return NextResponse.json({
            success: true,
            processedCount: results.length,
            results
        });

    } catch (error) {
        console.error('[Cron] Scheduled upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Cron job failed' },
            { status: 500 }
        );
    }
}
