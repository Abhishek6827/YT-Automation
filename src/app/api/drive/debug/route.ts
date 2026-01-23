import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { extractFolderId, createDriveClient } from '@/lib/services/drive';

// GET /api/drive/debug - Debug folder contents 
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const folderLink = request.nextUrl.searchParams.get('folderLink');
        if (!folderLink) {
            return NextResponse.json({ error: 'Missing folderLink parameter' }, { status: 400 });
        }

        const folderId = extractFolderId(folderLink);
        if (!folderId) {
            return NextResponse.json({ error: 'Invalid folder link' }, { status: 400 });
        }

        const drive = createDriveClient(session.accessToken);

        // Get ALL files in the folder (not just videos)
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, shortcutDetails)',
            pageSize: 100,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        const files = response.data.files || [];

        // Categorize files
        const videos = files.filter(f => f.mimeType?.includes('video/'));
        const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
        const shortcuts = files.filter(f => f.mimeType === 'application/vnd.google-apps.shortcut');
        const other = files.filter(f =>
            !f.mimeType?.includes('video/') &&
            f.mimeType !== 'application/vnd.google-apps.folder' &&
            f.mimeType !== 'application/vnd.google-apps.shortcut'
        );

        return NextResponse.json({
            folderId,
            totalFiles: files.length,
            breakdown: {
                videos: videos.length,
                folders: folders.length,
                shortcuts: shortcuts.length,
                other: other.length,
            },
            files: files.map(f => ({
                name: f.name,
                mimeType: f.mimeType,
                isShortcut: f.mimeType === 'application/vnd.google-apps.shortcut',
                shortcutTarget: f.shortcutDetails?.targetMimeType,
            })),
        });
    } catch (error) {
        console.error('[API] Error debugging folder:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to debug folder' },
            { status: 500 }
        );
    }
}
