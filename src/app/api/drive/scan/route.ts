import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { extractFolderId, scanFolderStructure } from '@/lib/services/drive';

// GET /api/drive/scan - Scan folder structure and return tree
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

        console.log(`[API] Scanning folder structure: ${folderId}`);
        const result = await scanFolderStructure(session.accessToken, folderId);

        return NextResponse.json({
            root: result.root,
            totalVideos: result.totalVideos,
            fileCount: result.allFiles.length,
        });
    } catch (error) {
        console.error('[API] Error scanning folder:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to scan folder' },
            { status: 500 }
        );
    }
}
