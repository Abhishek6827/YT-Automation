import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// POST /api/videos/create - Create a new video record (used by local processor)
export async function POST(req: Request) {
    try {
        const session = await auth();
        const body = await req.json();

        const { driveId, fileName, title, description, tags, transcript, userId } = body;

        // Use userId from session or body (session takes precedence if available and valid)
        // If local processor uses it, it might pass userId in body without session
        const effectiveUserId = session?.user?.id || userId;

        if (!effectiveUserId) {
            return NextResponse.json({ error: 'Unauthorized: User ID required' }, { status: 401 });
        }

        if (!driveId || !fileName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if already exists
        const existing = await prisma.video.findUnique({
            where: { driveId }
        });

        if (existing) {
            return NextResponse.json({ error: 'Video already exists', id: existing.id }, { status: 409 });
        }

        // Create new video
        const video = await prisma.video.create({
            data: {
                userId: effectiveUserId,
                driveId,
                fileName,
                title: title || fileName,
                description: description || '',
                tags: tags || '',
                transcript: transcript || null,
                status: 'DRAFT',
            },
        });

        return NextResponse.json({ success: true, id: video.id });
    } catch (error) {
        console.error('Create video error:', error);
        return NextResponse.json({ error: 'Failed to create video' }, { status: 500 });
    }
}
