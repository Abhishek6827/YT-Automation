import { google } from 'googleapis';

// Extract folder or file ID from Google Drive link
export function extractFolderId(link: string): string | null {
    // Handles formats like:
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    // https://drive.google.com/file/d/FILE_ID/view
    // https://drive.google.com/open?id=ID

    const folderRegex = /\/folders\/([a-zA-Z0-9_-]+)/;
    const fileRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const idRegex = /[?&]id=([a-zA-Z0-9_-]+)/;

    let match = link.match(folderRegex);
    if (match) return match[1];

    match = link.match(fileRegex);
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
    folderId?: string;
    folderName?: string;
}

export interface FolderNode {
    id: string;
    name: string;
    videoCount: number;
    children: FolderNode[];
    included?: boolean;
}

export interface FolderScanResult {
    root: FolderNode;
    totalVideos: number;
    allFiles: DriveFile[];
}

// Get folder name by ID
export async function getFolderName(accessToken: string, folderId: string): Promise<string> {
    try {
        const drive = createDriveClient(accessToken);
        const response = await drive.files.get({
            fileId: folderId,
            fields: 'name',
        });
        return response.data.name || 'Root Folder';
    } catch {
        return 'Root Folder';
    }
}

// Scan folder structure and return tree with video counts
export async function scanFolderStructure(
    accessToken: string,
    folderId: string
): Promise<FolderScanResult> {
    const drive = createDriveClient(accessToken);
    const allFiles: DriveFile[] = [];

    async function scanFolder(currentFolderId: string, folderName: string): Promise<FolderNode> {
        const node: FolderNode = {
            id: currentFolderId,
            name: folderName,
            videoCount: 0,
            children: [],
            included: true,
        };

        try {
            // Count videos in current folder
            let pageToken: string | undefined;
            do {
                const videoResponse = await drive.files.list({
                    q: `'${currentFolderId}' in parents and (mimeType contains 'video/') and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
                    orderBy: 'name',
                    pageSize: 1000,
                    pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                });

                const videos = (videoResponse.data.files || []) as DriveFile[];
                console.log(`[Drive] Found ${videos.length} videos in folder "${folderName}" (${currentFolderId})`);
                videos.forEach(v => {
                    v.folderId = currentFolderId;
                    v.folderName = folderName;
                });
                allFiles.push(...videos);
                node.videoCount += videos.length;
                pageToken = videoResponse.data.nextPageToken || undefined;
            } while (pageToken);

            // Get subfolders
            let folderPageToken: string | undefined;
            do {
                const folderResponse = await drive.files.list({
                    q: `'${currentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'nextPageToken, files(id, name)',
                    orderBy: 'name',
                    pageSize: 100,
                    pageToken: folderPageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                });

                const subfolders = folderResponse.data.files || [];
                console.log(`[Drive] Found ${subfolders.length} subfolders in "${folderName}"`);

                // Recursively scan subfolders
                for (const subfolder of subfolders) {
                    if (subfolder.id && subfolder.name) {
                        const childNode = await scanFolder(subfolder.id, subfolder.name);
                        node.children.push(childNode);
                    }
                }
                folderPageToken = folderResponse.data.nextPageToken || undefined;
            } while (folderPageToken);
        } catch (error) {
            console.error(`[Drive] Error scanning folder ${currentFolderId}:`, error);
        }

        return node;
    }

    // Get root folder name
    const rootName = await getFolderName(accessToken, folderId);
    const root = await scanFolder(folderId, rootName);

    // Calculate total videos (including nested)
    function countTotalVideos(node: FolderNode): number {
        let total = node.videoCount;
        for (const child of node.children) {
            total += countTotalVideos(child);
        }
        return total;
    }

    return {
        root,
        totalVideos: countTotalVideos(root),
        allFiles,
    };
}

// List video files from a folder (recursively)
export async function listVideosFromFolder(
    accessToken: string,
    folderId: string,
    depth: number = 0,
    maxDepth: number = 10
): Promise<DriveFile[]> {
    console.log(`[Drive] Listing videos from folder: ${folderId} (Depth: ${depth})`);
    const drive = createDriveClient(accessToken);
    let allVideos: DriveFile[] = [];

    try {
        // Get folder name for tracking
        const folderName = await getFolderName(accessToken, folderId);

        // 1. Search for videos in current folder
        let pageToken: string | undefined;

        do {
            const videoResponse = await drive.files.list({
                q: `'${folderId}' in parents and (mimeType contains 'video/') and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
                orderBy: 'createdTime desc',
                pageSize: 1000,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            });

            const videos = (videoResponse.data.files || []) as DriveFile[];
            // Add folder info to each video
            videos.forEach(v => {
                v.folderId = folderId;
                v.folderName = folderName;
            });
            allVideos = [...allVideos, ...videos];
            pageToken = videoResponse.data.nextPageToken || undefined;
        } while (pageToken);

        console.log(`[Drive] Found ${allVideos.length} videos in folder ${folderId}`);

        // 2. Search for subfolders if depth limit not reached
        if (depth < maxDepth) {
            const folderResponse = await drive.files.list({
                q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 100,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
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

// Download a file from Drive as Buffer (for transcription)
export async function downloadFileBuffer(
    accessToken: string,
    fileId: string,
    maxBytes: number = 10 * 1024 * 1024 // Default 10MB limit for transcription
): Promise<Buffer> {
    const drive = createDriveClient(accessToken);

    try {
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const data = response.data as ArrayBuffer;
        let buffer = Buffer.from(data);

        // If file is larger than maxBytes, only take the first portion
        // This is fine for transcription since we only need audio sample
        if (buffer.length > maxBytes) {
            console.log(`[Drive] File is ${buffer.length} bytes, truncating to ${maxBytes} bytes for transcription`);
            buffer = buffer.subarray(0, maxBytes);
        }

        console.log(`[Drive] Downloaded ${buffer.length} bytes for transcription`);
        return buffer;
    } catch (error) {
        console.error('[Drive] Error downloading file as buffer:', error);
        throw error;
    }
}

