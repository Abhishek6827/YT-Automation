import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

// DELETE /api/videos/[id] - Delete a video
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        const video = await prisma.video.findUnique({
            where: { id },
        });

        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        // If uploaded to YouTube, try to delete it there too
        if (video.youtubeId) {
            try {
                const authClient = new google.auth.OAuth2();
                authClient.setCredentials({ access_token: session.accessToken });
                const youtube = google.youtube({ version: 'v3', auth: authClient });

                await youtube.videos.delete({
                    id: video.youtubeId,
                });
                console.log(`Deleted video ${video.youtubeId} from YouTube`);
            } catch (ytError) {
                console.error('Failed to delete from YouTube:', ytError);
                // Continue to delete from DB even if YT fails (or maybe it was already deleted)
            }
        }

        // Delete from Database
        await prisma.video.delete({
            where: { id },
        });

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

    try {
        const { id } = await params;
        const body = await request.json();

        // Allowed fields to update
        const { title, description, tags, status } = body;

        // Validation could be added here

        const video = await prisma.video.update({
            where: { id },
            data: {
                title,
                description,
                tags,
                status, // e.g. change DRAFT to PENDING
            },
        });

        return NextResponse.json(video);
    } catch (error) {
        console.error('Update error:', error);
        return NextResponse.json({ error: 'Failed to update video' }, { status: 500 });
    }
}
