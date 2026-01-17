import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { deleteVideo, updateVideoMetadata } from '@/lib/services/youtube';

export const dynamic = 'force-dynamic';

// DELETE /api/videos/[id] - Delete video from DB and optionally from YouTube
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        // Find the video first
        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        // If it was uploaded to YouTube, delete it there too
        if (video.youtubeId) {
            const ytResult = await deleteVideo(session.accessToken, video.youtubeId);
            if (!ytResult.success) {
                console.error('Failed to delete from YouTube:', ytResult.error);
                // Continue anyway to remove from our DB
            }
        }

        // Delete from database
        await prisma.video.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
    }
}

// PATCH /api/videos/[id] - Update video metadata
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    try {
        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        // Update in our database
        const updateData: { title?: string; description?: string; tags?: string; status?: string } = {};
        if (body.title !== undefined) updateData.title = body.title;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.tags !== undefined) updateData.tags = body.tags;
        if (body.status !== undefined) updateData.status = body.status;

        const updated = await prisma.video.update({
            where: { id },
            data: updateData,
        });

        // If video is already on YouTube, update it there too
        if (video.youtubeId && (body.title || body.description || body.tags)) {
            const ytResult = await updateVideoMetadata(session.accessToken, video.youtubeId, {
                title: body.title || video.title || video.fileName,
                description: body.description || video.description || '',
                tags: (body.tags || video.tags || '').split(',').filter(Boolean),
            });
            if (!ytResult.success) {
                console.error('Failed to update on YouTube:', ytResult.error);
            }
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: 'Failed to update video' }, { status: 500 });
    }
}
