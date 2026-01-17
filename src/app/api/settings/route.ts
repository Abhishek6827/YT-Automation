import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/settings - Get current settings
export async function GET() {
    try {
        let settings = await prisma.settings.findFirst({
            where: { id: 1 },
        });

        if (!settings) {
            settings = await prisma.settings.create({
                data: { id: 1 },
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

// POST /api/settings - Update settings
export async function POST(request: Request) {
    const session = await auth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { driveFolderLink, uploadHour, videosPerDay } = body;

        const settings = await prisma.settings.upsert({
            where: { id: 1 },
            update: {
                driveFolderLink,
                uploadHour: uploadHour ? parseInt(uploadHour) : undefined,
                videosPerDay: videosPerDay ? parseInt(videosPerDay) : undefined,
            },
            create: {
                id: 1,
                driveFolderLink,
                uploadHour: uploadHour ? parseInt(uploadHour) : 10,
                videosPerDay: videosPerDay ? parseInt(videosPerDay) : 1,
            },
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
