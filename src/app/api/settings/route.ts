import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/settings - Get settings for the current user
export async function GET() {
    const session = await auth();
    console.log('[Settings GET] session:', { userId: session?.user?.id, hasAccessToken: !!session?.accessToken, error: session?.error });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const settings = await prisma.settings.findUnique({
            where: { userId: session.user.id },
        });

        if (!settings) {
            // Create default settings if not exists
            const newSettings = await prisma.settings.create({
                data: {
                    userId: session.user.id,
                    uploadHour: 10,
                    videosPerDay: 1,
                },
            });
            return NextResponse.json(newSettings);
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

// POST /api/settings - Update settings
export async function POST(req: Request) {
    const session = await auth();
    console.log('[Settings POST] session:', { userId: session?.user?.id, hasAccessToken: !!session?.accessToken, error: session?.error });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { driveFolderLink, uploadHour, videosPerDay } = body || {};

        // Helper to parse integers safely and fallback to defaults
        const parseIntSafe = (val: any, fallback: number) => {
            if (val === undefined || val === null) return fallback;
            const n = parseInt(String(val), 10);
            return Number.isNaN(n) ? fallback : n;
        };

        const safeUploadHour = parseIntSafe(uploadHour, 10);
        const safeVideosPerDay = parseIntSafe(videosPerDay, 1);

        // Normalize driveFolderLink: treat empty strings as null
        const safeDriveFolderLink = typeof driveFolderLink === 'string' && driveFolderLink.trim() !== ''
            ? driveFolderLink.trim()
            : null;

        const settings = await prisma.settings.upsert({
            where: { userId: session.user.id },
            update: {
                driveFolderLink: safeDriveFolderLink,
                uploadHour: safeUploadHour,
                videosPerDay: safeVideosPerDay,
            },
            create: {
                userId: session.user.id,
                driveFolderLink: safeDriveFolderLink,
                uploadHour: safeUploadHour,
                videosPerDay: safeVideosPerDay,
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
