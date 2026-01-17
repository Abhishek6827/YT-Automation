import { NextResponse } from 'next/server';
import { generateVideoMetadata } from '@/lib/services/ai';

export const dynamic = 'force-dynamic';

// POST /api/ai/regenerate - Regenerate metadata for a file
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { fileName } = body;

        if (!fileName) {
            return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
        }

        const metadata = await generateVideoMetadata(fileName);

        return NextResponse.json({
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags.join(', '),
        });
    } catch (error) {
        console.error('AI regenerate error:', error);
        return NextResponse.json({ error: 'Failed to regenerate metadata' }, { status: 500 });
    }
}
