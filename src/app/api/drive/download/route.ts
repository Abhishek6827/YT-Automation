import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/drive/download?fileId=xxx - Download a file from Drive
export async function GET(req: Request) {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');

    if (!fileId) {
        return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    try {
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: session.accessToken });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Download file
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const buffer = response.data as ArrayBuffer;

        // Return as binary response
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': buffer.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error('Drive download error:', error);
        return NextResponse.json({ error: 'Failed to download' }, { status: 500 });
    }
}
