import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listVideosFromFolder, extractFolderId } from '@/lib/services/drive';

export const dynamic = 'force-dynamic';

// GET /api/automation/preview - Get list of pending videos from Drive (not yet in DB)
export async function GET() {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const settings = await prisma.settings.findFirst({
            where: { id: 1 },
        });

        if (!settings?.driveFolderLink) {
            return NextResponse.json({ files: [], error: 'No Drive folder configured' });
        }

        const folderId = extractFolderId(settings.driveFolderLink);
        if (!folderId) {
            return NextResponse.json({ files: [], error: 'Invalid folder link' });
        }

        // Get files from Drive
        const driveFiles = await listVideosFromFolder(session.accessToken, folderId);

        // Get already processed file IDs
        const existingVideos = await prisma.video.findMany({
            select: { driveId: true },
        });
        const processedIds = new Set(existingVideos.map(v => v.driveId));

        // Filter to only new files
        const newFiles = driveFiles.filter((f: { id: string }) => !processedIds.has(f.id));

        return NextResponse.json({
            files: newFiles.map((f: { id: string; name: string; size?: string }) => ({
                id: f.id,
                name: f.name,
                size: f.size ? parseInt(f.size, 10) : undefined,
                driveUrl: `https://drive.google.com/file/d/${f.id}/view`,
            })),
        });
    } catch (error) {
        console.error('Preview error:', error);
        return NextResponse.json({ files: [], error: 'Failed to fetch files' }, { status: 500 });
    }
}
