import { auth } from '@/auth';
import { createDriveClient } from '@/lib/services/drive';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        if (!session?.accessToken) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const drive = createDriveClient(session.accessToken);
        const fileId = params.id;

        // Get file metadata for Content-Type and Size
        const metadata = await drive.files.get({
            fileId: fileId,
            fields: 'size, mimeType, name',
        });

        // Get file stream
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        const stream = response.data as unknown as any;

        // Create a new Response with the stream
        // Note: We're using standard Response here as it handles streams better in some contexts,
        // but NextResponse is also fine. We pass headers for video playback.
        const headers = new Headers();
        headers.set('Content-Type', metadata.data.mimeType || 'video/mp4');
        if (metadata.data.size) {
            headers.set('Content-Length', metadata.data.size);
        }
        // Content-Disposition inline allows browser to play it
        headers.set('Content-Disposition', `inline; filename="${metadata.data.name}"`);

        // Basic range support (simplified) - if needed, complex range handling usually requires more logic.
        // For now, we stream the whole file or let browser handle partial content if it requests it? 
        // Google Drive API supports 'Range' header in request if we pass it through.

        // Check for Range header in request
        const range = req.headers.get('range');
        if (range) {
            // If range is requested, we should ideally pass it to Drive API.
            // Re-requesting with range header:
            const rangeResponse = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream', headers: { Range: range } }
            );

            // Update headers for partial content
            // Drive API usually returns Content-Range in the response headers if Range was sent.
            // But axios/google-auth interaction might hide it.
            // For a simple preview, simple streaming usually works.
            // Let's stick to the first response for now, or implement range if strictly needed.

            // Actually, let's just forward the stream. Browser smartness might minimal here.
            // If range is critical for seeking, we might need to proxy that headers.

            // Let's implement full Range support later if seeking is broken. 
            // For "hover preview", seeking isn't primary, playing is.
        }

        // Convert Node stream to Web ReadableStream for Next.js
        const iterator = stream[Symbol.asyncIterator]();
        const readable = new ReadableStream({
            async pull(controller) {
                const { value, done } = await iterator.next();
                if (done) controller.close();
                else controller.enqueue(value);
            },
        });

        return new NextResponse(readable, {
            headers,
        });

    } catch (error) {
        console.error('Proxy Error:', error);
        return new NextResponse('Error fetching video', { status: 500 });
    }
}
