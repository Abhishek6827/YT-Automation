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

// List video files from a folder
export async function listVideosFromFolder(
    accessToken: string,
    folderId: string
): Promise<DriveFile[]> {
    const drive = createDriveClient(accessToken);

    const response = await drive.files.list({
        q: `'${folderId}' in parents and (mimeType contains 'video/')`,
        fields: 'files(id, name, mimeType, size, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 100,
    });

    return (response.data.files || []) as DriveFile[];
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

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    createdTime?: string;
}
