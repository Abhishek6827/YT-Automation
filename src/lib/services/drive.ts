import { google } from 'googleapis';

// Extract folder ID from Google Drive link
export function extractFolderId(link: string): string | null {
    // Handles formats like:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
    // https://drive.google.com/open?id=FOLDER_ID

    const folderRegex = /\/folders\/([a-zA-Z0-9_-]+)/;
    const idRegex = /[?&]id=([a-zA-Z0-9_-]+)/;

    let match = link.match(folderRegex);
    if (match) return match[1];

    match = link.match(idRegex);
    if (match) return match[1];

    // Check if it's just the ID itself
    if (/^[a-zA-Z0-9_-]{20,}$/.test(link)) {
        return link;
    }

    return null;
}

// Create an OAuth2 client for Drive API
export function createDriveClient(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.drive({ version: 'v3', auth });
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
}

// List video files from a folder (recursively)
export async function listVideosFromFolder(
    accessToken: string,
    folderId: string,
    depth: number = 0,
    maxDepth: number = 2
): Promise<DriveFile[]> {
    console.log(`[Drive] Listing videos from folder: ${folderId} (Depth: ${depth})`);
    const drive = createDriveClient(accessToken);
    let allVideos: DriveFile[] = [];

    try {
        // 1. Search for videos in current folder
        const videoResponse = await drive.files.list({
            q: `'${folderId}' in parents and (mimeType contains 'video/') and trashed = false`,
            fields: 'files(id, name, mimeType, size, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 100,
        });

        const videos = (videoResponse.data.files || []) as DriveFile[];
        allVideos = [...videos];
        console.log(`[Drive] Found ${videos.length} videos in folder ${folderId}`);

        // 2. Search for subfolders if depth limit not reached
        if (depth < maxDepth) {
            const folderResponse = await drive.files.list({
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 20,
            });

            const subfolders = folderResponse.data.files || [];
            if (subfolders.length > 0) {
                console.log(`[Drive] Found ${subfolders.length} subfolders in ${folderId}, checking recursively...`);
                for (const subfolder of subfolders) {
                    if (subfolder.id) {
                        const subVideos = await listVideosFromFolder(accessToken, subfolder.id, depth + 1, maxDepth);
                        allVideos = [...allVideos, ...subVideos];
                    }
                }
            }
        }

        return allVideos;
    } catch (error) {
        console.error('[Drive] Error listing files:', error);
        throw error;
    }
}

// Download a file from Drive
export async function downloadFile(
    accessToken: string,
    fileId: string
): Promise<NodeJS.ReadableStream> {
    const drive = createDriveClient(accessToken);

    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    return response.data as NodeJS.ReadableStream;
}

// Get file metadata
export async function getFileMetadata(
    accessToken: string,
    fileId: string
): Promise<DriveFile> {
    const drive = createDriveClient(accessToken);

    const response = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, createdTime',
    });

    return response.data as DriveFile;
}
