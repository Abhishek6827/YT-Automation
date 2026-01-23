import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/settings - Get settings for the current user
export async function GET() {
    const session = await auth();
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
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { driveFolderLink, uploadHour, videosPerDay } = body;

        const settings = await prisma.settings.upsert({
            where: { userId: session.user.id },
            update: {
                driveFolderLink,
                uploadHour: parseInt(uploadHour),
                videosPerDay: parseInt(videosPerDay),
            },
            create: {
                userId: session.user.id,
                driveFolderLink,
                uploadHour: parseInt(uploadHour),
                videosPerDay: parseInt(videosPerDay),
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
