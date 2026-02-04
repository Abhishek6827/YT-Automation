import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runAutomation } from '@/lib/services/automation';

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

        // 1. Find all users with configured settings
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
        const currentHour = new Date().getUTCHours(); // Server runs in UTC usually. Use UTC for consistency.

        // 2. Iterate each user
        for (const setting of allSettings) {
            const user = setting.user;

            // Validate User & Token
            if (!user || !user.accounts[0]?.refresh_token) {
                console.log(`[Cron] Skipping user ${user?.id}: No Google account/refresh token`);
                continue;
            }

            // Validation passed
            console.log(`[Cron] Processing user: ${user.id} (Daily Run)`);

            // 3. Refresh Token
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

            // 4. Run Automation
            try {
                const result = await runAutomation(
                    user.id,
                    accessToken,
                    setting.driveFolderLink!,
                    setting.videosPerDay,
                    setting.uploadHour
                );
                results.push({ userId: user.id, success: true, result });
            } catch (runError) {
                console.error(`[Cron] Automation failed for user ${user.id}:`, runError);
                results.push({ userId: user.id, success: false, error: String(runError) });
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
