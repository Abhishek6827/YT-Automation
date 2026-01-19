#!/usr/bin/env node
/**
 * Local Video Processor - API Version
 * 
 * This script runs locally with NO timeout limits.
 * It transcribes videos using Replicate Whisper, then sends
 * the results to your Vercel app's API endpoint.
 * 
 * Usage: npm run process:local
 */

import 'dotenv/config';
import Replicate from 'replicate';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configuration
const API_BASE = process.env.NEXTAUTH_URL || 'https://yt-automation-h3vf.vercel.app';

// Initialize APIs
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Colors for console
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const icons = { info: `${c.cyan}ℹ${c.reset}`, success: `${c.green}✓${c.reset}`, warn: `${c.yellow}⚠${c.reset}`, error: `${c.red}✗${c.reset}` };
    console.log(`${icons[type]} ${msg}`);
}

// Get access token by calling the session API
async function getSessionToken(): Promise<string | null> {
    // For local processing, we'll use a simple API key approach
    // The API endpoint will handle authentication
    return 'local-processor';
}

// List videos from Drive via API
async function listVideosFromDrive(): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${API_BASE}/api/automation/preview`);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to list videos: ${text}`);
    }
    const data = await res.json();
    return data.files || [];
}

// Get already processed video IDs via API
async function getProcessedDriveIds(): Promise<Set<string>> {
    const res = await fetch(`${API_BASE}/api/videos`);
    if (!res.ok) return new Set();
    const videos = await res.json();
    return new Set(videos.map((v: { driveId: string }) => v.driveId));
}

// Download video from Google Drive directly (using public link)
async function downloadFromDrive(fileId: string): Promise<Buffer | null> {
    try {
        // First, try the direct download URL
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

        // We need to use the preview API endpoint which has the access token
        const res = await fetch(`${API_BASE}/api/drive/download?fileId=${fileId}`);

        if (!res.ok) {
            log(`  Download failed: ${res.status}`, 'error');
            return null;
        }

        return Buffer.from(await res.arrayBuffer());
    } catch (error) {
        log(`  Download error: ${error}`, 'error');
        return null;
    }
}

// Upload to Replicate for transcription
async function uploadToReplicate(buffer: Buffer, fileName: string): Promise<string | null> {
    try {
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
        const file = new File([blob], fileName, { type: 'video/mp4' });
        const fileUrl = await replicate.files.create(file);
        return fileUrl.urls?.get || null;
    } catch (error) {
        log(`  Upload to Replicate failed: ${error}`, 'error');
        return null;
    }
}

// Transcribe with Whisper (NO TIMEOUT - runs until complete!)
async function transcribe(audioUrl: string): Promise<string | null> {
    try {
        log('  🎙️  Running Whisper transcription (this may take 1-3 minutes)...', 'info');

        const output = await replicate.run(
            "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
            {
                input: {
                    audio: audioUrl,
                    model: "base",
                    translate: false,
                    temperature: 0,
                    transcription: "plain text",
                }
            }
        );

        const result = output as { transcription?: string; text?: string };
        const transcript = result.transcription || result.text || (typeof output === 'string' ? output : '');

        return transcript?.trim() || null;
    } catch (error) {
        log(`  Whisper error: ${error}`, 'error');
        return null;
    }
}

// Generate metadata from transcript
async function generateMetadata(transcript: string, fileName: string): Promise<{ title: string; description: string; tags: string[] }> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Based on this VIDEO TRANSCRIPT, generate YouTube Shorts metadata.

TRANSCRIPT:
"${transcript.slice(0, 3000)}"

Generate JSON with:
1. title: Catchy, viral title with emojis (max 80 chars) - MUST relate to transcript content
2. description: Engaging description based on video content (2-3 sentences) + call to action + 5 hashtags
3. tags: 15-20 relevant tags based on ACTUAL transcript topics

Output ONLY valid JSON:
{"title": "...", "description": "...", "tags": ["..."]}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                title: parsed.title || fileName,
                description: parsed.description || '',
                tags: parsed.tags || [],
            };
        }
    } catch (error) {
        log(`  AI error: ${error}`, 'error');
    }

    return { title: fileName, description: 'Check out this video!', tags: ['shorts'] };
}

// Save video via API
async function saveVideoToDatabase(data: {
    driveId: string;
    fileName: string;
    title: string;
    description: string;
    tags: string;
    transcript: string | null;
}): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/api/videos/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// Main
async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log(`${c.bold}${c.cyan}  YT Automation - Local Transcription Processor${c.reset}`);
    console.log(`${c.dim}  No timeout limits! Full Whisper transcription support.${c.reset}`);
    console.log('═'.repeat(60) + '\n');

    // Check env vars
    if (!process.env.REPLICATE_API_TOKEN) {
        log('REPLICATE_API_TOKEN not set in .env', 'error');
        process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
        log('GEMINI_API_KEY not set in .env', 'error');
        process.exit(1);
    }

    log(`API Base: ${API_BASE}`, 'info');
    log('Fetching videos from Google Drive...', 'info');

    try {
        // Get videos from Drive
        const driveFiles = await listVideosFromDrive();
        log(`Found ${driveFiles.length} videos in Drive`, 'success');

        // Get already processed
        const processedIds = await getProcessedDriveIds();
        log(`Already processed: ${processedIds.size} videos`, 'info');

        // Filter new
        const newFiles = driveFiles.filter(f => !processedIds.has(f.id));

        if (newFiles.length === 0) {
            log('All videos already processed!', 'success');
            return;
        }

        log(`\n${c.bold}Processing ${newFiles.length} new videos...${c.reset}\n`, 'info');

        let success = 0, failed = 0;

        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];
            console.log(`\n${c.cyan}[${i + 1}/${newFiles.length}]${c.reset} ${file.name}`);

            try {
                // Download
                log('  Downloading from Drive...', 'info');
                const buffer = await downloadFromDrive(file.id);

                if (!buffer || buffer.length === 0) {
                    log('  Failed to download', 'error');
                    failed++;
                    continue;
                }
                log(`  Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB`, 'success');

                // Upload to Replicate
                log('  Uploading to Replicate...', 'info');
                const replicateUrl = await uploadToReplicate(buffer, file.name);

                if (!replicateUrl) {
                    failed++;
                    continue;
                }
                log('  Uploaded successfully', 'success');

                // Transcribe (NO TIMEOUT!)
                const transcript = await transcribe(replicateUrl);

                if (!transcript) {
                    log('  Transcription failed, skipping', 'warn');
                    failed++;
                    continue;
                }
                log(`  Transcript: "${transcript.slice(0, 100)}..."`, 'success');

                // Generate metadata from transcript
                log('  Generating AI metadata from transcript...', 'info');
                const metadata = await generateMetadata(transcript, file.name);
                log(`  Title: ${metadata.title}`, 'success');

                // Save via API
                log('  Saving to database...', 'info');
                const saved = await saveVideoToDatabase({
                    driveId: file.id,
                    fileName: file.name,
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags.join(','),
                    transcript: transcript,
                });

                if (saved) {
                    log('  ✅ Saved as draft!', 'success');
                    success++;
                } else {
                    log('  Failed to save', 'error');
                    failed++;
                }

            } catch (error) {
                log(`  Error: ${error}`, 'error');
                failed++;
            }
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log(`${c.bold}${c.green}  Processing Complete!${c.reset}`);
        console.log(`  ${c.green}✓ ${success} videos processed with transcripts${c.reset}`);
        if (failed > 0) console.log(`  ${c.red}✗ ${failed} failed${c.reset}`);
        console.log('═'.repeat(60) + '\n');

    } catch (error) {
        log(`Fatal error: ${error}`, 'error');
    }
}

main();
