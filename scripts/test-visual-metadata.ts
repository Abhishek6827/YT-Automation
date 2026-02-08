import { extractFrames } from '@/lib/services/video';
import { generateMetadataFromVisuals } from '@/lib/services/ai';
import path from 'path';
import fs from 'fs';

// Usage: npx tsx scripts/test-visual-metadata.ts <path-to-video>
const videoPath = process.argv[2];

if (!videoPath) {
    console.error('Please provide a video file path');
    process.exit(1);
}

const resolvedPath = path.resolve(videoPath);

async function testVisualMetadata() {
    try {
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath}`);
        }

        console.log(`Processing video: ${resolvedPath}`);

        // 1. Extract Frames
        console.log('Extracting frames...');
        const frames = await extractFrames(resolvedPath, 3);
        console.log(`Extracted ${frames.length} frames.`);

        // 2. Generate Metadata
        if (frames.length > 0) {
            console.log('Generating metadata...');
            const metadata = await generateMetadataFromVisuals(frames, path.basename(resolvedPath));

            console.log('\n--- GENERATED METADATA ---');
            console.log(JSON.stringify(metadata, null, 2));
            console.log('--------------------------\n');
        } else {
            console.log('No frames extracted.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testVisualMetadata();
