import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { getChannelInfo } from '@/lib/services/youtube';

export const dynamic = 'force-dynamic';

// GET /api/channel - Get YouTube channel info
export async function GET() {
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const channel = await getChannelInfo(session.accessToken);

        if (!channel) {
            return NextResponse.json({ error: 'No channel found' }, { status: 404 });
        }

        return NextResponse.json(channel);
    } catch (error) {
        console.error('Channel error:', error);
        return NextResponse.json({ error: 'Failed to get channel info' }, { status: 500 });
    }
}
