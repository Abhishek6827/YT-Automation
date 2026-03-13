import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const videoId = process.argv[2];

if (!videoId) {
    console.error('Please provide a video ID as an argument.');
    console.error('Usage: npx tsx scripts/inspect-video.ts <VIDEO_ID>');
    process.exit(1);
}

async function inspectVideo() {
    try {
        // Get user (assuming single user for now or get first one)
        const user = await prisma.user.findFirst();

        if (!user) {
            console.error('No user found in database.');
            process.exit(1);
        }

        const account = await prisma.account.findFirst({
            where: { userId: user.id }
        });

        if (!account?.access_token) {
            throw new Error('No access token found. Please login.');
        }

        console.log(`Inspecting Video ID: ${videoId}`);

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: account.access_token });
        const youtube = google.youtube({ version: 'v3', auth });

        const response = await youtube.videos.list({
            part: ['snippet', 'status', 'contentDetails', 'statistics', 'player', 'processingDetails', 'suggestions', 'topicDetails'],
            id: [videoId],
        });

        const video = response.data.items?.[0];

        if (!video) {
            console.log('Video not found.');
        } else {
            console.log(JSON.stringify(video, null, 2));
        }

    } catch (error) {
        console.error('Error inspecting video:', error);
    }
}

inspectVideo();
