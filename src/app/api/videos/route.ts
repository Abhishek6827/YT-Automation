import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/videos - Get all processed videos
export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            orderBy: { createdAt: 'desc' },
            take: 1000,
        });

        return NextResponse.json(videos);
    } catch (error) {
        console.error('Error fetching videos:', error);
        return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
    }
}

// DELETE /api/videos - Clear video history (for testing)
export async function DELETE() {
    const session = await auth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await prisma.video.deleteMany({});
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing videos:', error);
        return NextResponse.json({ error: 'Failed to clear videos' }, { status: 500 });
    }
}
