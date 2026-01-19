#!/usr/bin/env node
/**
 * Local Video Processing Script for YT Automation
 * 
 * This script runs on your local machine (no timeout limits!)
 * It processes videos from Google Drive, transcribes with Whisper,
 * generates AI metadata, and saves to your database.
 * 
 * Usage:
 *   npx ts-node scripts/process-local.ts
 *   
 * Or run with npm:
 *   npm run process:local
 */

import 'dotenv/config';
import Replicate from 'replicate';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Prisma client - direct import for local script
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Initialize Replicate
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface DriveFile {
    id: string;
    name: string;
}

interface TranscriptionResult {
    success: boolean;
    transcript?: string;
    error?: string;
}

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const prefix = {
        info: `${colors.cyan}ℹ${colors.reset}`,
        success: `${colors.green}✓${colors.reset}`,
        warn: `${colors.yellow}⚠${colors.reset}`,
        error: `${colors.red}✗${colors.reset}`,
    };
    console.log(`${prefix[type]} ${message}`);
}

// Get access token using refresh token from database
async function getAccessToken(): Promise<string | null> {
    const account = await prisma.account.findFirst({
        where: { provider: 'google' },
    });

    if (!account?.refresh_token) {
        log('No Google account found. Please sign in to the app first.', 'error');
        return null;
    }

    // Refresh the token
    const { google } = await import('googleapis');
    const authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    authClient.setCredentials({ refresh_token: account.refresh_token });
    const { credentials } = await authClient.refreshAccessToken();
    return credentials.access_token || null;
}

// List videos from Drive folder
async function listVideosFromFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
        q: `'${folderId}' in parents and (mimeType contains 'video/')`,
        fields: 'files(id, name)',
        pageSize: 1000,
    });

    return (response.data.files || []) as DriveFile[];
}

// Download file buffer from Drive (no size limit locally!)
async function downloadFileBuffer(accessToken: string, fileId: string, maxBytes: number = 50 * 1024 * 1024): Promise<Buffer | null> {
    try {
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        let buffer = Buffer.from(response.data as ArrayBuffer);

        // Truncate if needed (for very large files)
        if (buffer.length > maxBytes) {
            log(`  File is ${(buffer.length / 1024 / 1024).toFixed(1)}MB, truncating to ${(maxBytes / 1024 / 1024).toFixed(1)}MB`, 'warn');
            buffer = buffer.subarray(0, maxBytes);
        }

        return buffer;
    } catch (error) {
        log(`  Failed to download: ${error}`, 'error');
        return null;
    }
}

// Upload file to Replicate for transcription
async function uploadForTranscription(videoBuffer: Buffer, fileName: string): Promise<string | null> {
    try {
        const arrayBuffer = videoBuffer.buffer.slice(
            videoBuffer.byteOffset,
            videoBuffer.byteOffset + videoBuffer.length
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
        const file = new File([blob], fileName, { type: 'video/mp4' });

        const fileUrl = await replicate.files.create(file);
        return fileUrl.urls?.get || null;
    } catch (error) {
        log(`  Failed to upload to Replicate: ${error}`, 'error');
        return null;
    }
}

// Transcribe with Whisper (no timeout - can take as long as needed!)
async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    try {
        log(`  Running Whisper transcription (this may take 1-2 minutes)...`, 'info');

        const output = await replicate.run(
            "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
            {
                input: {
                    audio: audioUrl,
                    model: "base",
                    translate: false,
                    temperature: 0,
                    transcription: "plain text",
                    suppress_tokens: "-1",
                    logprob_threshold: -1,
                    no_speech_threshold: 0.6,
                    condition_on_previous_text: true,
                    compression_ratio_threshold: 2.4,
                }
            }
        );

        const result = output as { transcription?: string; text?: string };
        const transcript = result.transcription || result.text || (typeof output === 'string' ? output : '');

        if (!transcript) {
            return { success: false, error: 'No transcript returned' };
        }

        return { success: true, transcript: transcript.trim() };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

// Generate metadata from transcript using Gemini
async function generateMetadataFromTranscript(transcript: string, fileName: string): Promise<{ title: string; description: string; tags: string[] }> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are a YouTube shorts content expert. Based on this video transcript, generate engaging metadata.

TRANSCRIPT:
${transcript.slice(0, 2000)}

FILE NAME (for context): ${fileName}

Generate:
1. A catchy, clickbait-style title (max 100 chars) with emojis
2. An engaging description (2-3 sentences) with call-to-action
3. 10 relevant hashtags/tags

Respond in this exact JSON format:
{
  "title": "Your Title Here",
  "description": "Your description here",
  "tags": ["tag1", "tag2", ...]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Extract JSON from response
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
        log(`  AI metadata generation failed: ${error}`, 'error');
    }

    // Fallback
    return {
        title: fileName.replace(/\.[^.]+$/, ''),
        description: 'Check out this video!',
        tags: ['shorts', 'viral'],
    };
}

// Extract folder ID from Google Drive link
function extractFolderId(link: string): string | null {
    const patterns = [
        /\/folders\/([a-zA-Z0-9_-]+)/,
        /id=([a-zA-Z0-9_-]+)/,
        /^([a-zA-Z0-9_-]+)$/,
    ];

    for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Main processing function
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.cyan}  YT Automation - Local Video Processor${colors.reset}`);
    console.log(`${colors.dim}  No timeout limits! Full transcription support.${colors.reset}`);
    console.log('='.repeat(60) + '\n');

    // Check required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
        log('REPLICATE_API_TOKEN not set in .env', 'error');
        process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
        log('GEMINI_API_KEY not set in .env', 'error');
        process.exit(1);
    }

    // Get settings from database
    const settings = await prisma.settings.findFirst({ where: { id: 1 } });
    if (!settings?.driveFolderLink) {
        log('No Drive folder configured. Please set it in the web app first.', 'error');
        process.exit(1);
    }

    const folderId = extractFolderId(settings.driveFolderLink);
    if (!folderId) {
        log('Invalid Drive folder link', 'error');
        process.exit(1);
    }

    // Get access token
    log('Getting access token...', 'info');
    const accessToken = await getAccessToken();
    if (!accessToken) {
        process.exit(1);
    }
    log('Access token obtained', 'success');

    // List videos from Drive
    log('Fetching videos from Google Drive...', 'info');
    const driveFiles = await listVideosFromFolder(accessToken, folderId);
    log(`Found ${driveFiles.length} videos in Drive folder`, 'success');

    // Get already processed videos
    const existingVideos = await prisma.video.findMany({
        select: { driveId: true },
    });
    const processedIds = new Set(existingVideos.map(v => v.driveId));

    // Filter new videos
    const newFiles = driveFiles.filter(f => !processedIds.has(f.id));

    if (newFiles.length === 0) {
        log('All videos have already been processed!', 'success');
        await prisma.$disconnect();
        return;
    }

    log(`${newFiles.length} new videos to process\n`, 'info');

    // Process each video
    let processed = 0;
    let failed = 0;

    for (const file of newFiles) {
        console.log(`\n${colors.cyan}[${processed + 1}/${newFiles.length}]${colors.reset} ${file.name}`);

        try {
            // Download video (up to 20MB for transcription)
            log('  Downloading from Drive...', 'info');
            const videoBuffer = await downloadFileBuffer(accessToken, file.id, 20 * 1024 * 1024);

            if (!videoBuffer) {
                log('  Failed to download video', 'error');
                failed++;
                continue;
            }
            log(`  Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`, 'success');

            // Upload to Replicate
            log('  Uploading to Replicate...', 'info');
            const fileUrl = await uploadForTranscription(videoBuffer, file.name);

            if (!fileUrl) {
                log('  Failed to upload for transcription', 'error');
                failed++;
                continue;
            }
            log('  Uploaded successfully', 'success');

            // Transcribe with Whisper
            const transcriptionResult = await transcribeAudio(fileUrl);

            let transcript: string | null = null;
            let metadata;

            if (transcriptionResult.success && transcriptionResult.transcript) {
                transcript = transcriptionResult.transcript;
                log(`  Transcript: "${transcript.slice(0, 80)}..."`, 'success');

                // Generate AI metadata from transcript
                log('  Generating AI metadata from transcript...', 'info');
                metadata = await generateMetadataFromTranscript(transcript, file.name);
            } else {
                log(`  Transcription failed: ${transcriptionResult.error}`, 'warn');
                log('  Using filename-based metadata fallback', 'info');
                metadata = await generateMetadataFromTranscript('', file.name);
            }

            // Check if already exists (race condition protection)
            const exists = await prisma.video.findUnique({
                where: { driveId: file.id }
            });

            if (exists) {
                log('  Video already exists in database (skipping)', 'warn');
                continue;
            }

            // Save to database
            await prisma.video.create({
                data: {
                    driveId: file.id,
                    fileName: file.name,
                    status: 'DRAFT',
                    title: metadata.title,
                    description: metadata.description,
                    tags: metadata.tags.join(','),
                    transcript: transcript,
                },
            });

            log(`  ✓ Saved as draft: "${metadata.title}"`, 'success');
            processed++;

        } catch (error) {
            log(`  Error: ${error}`, 'error');
            failed++;
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.green}  Processing Complete!${colors.reset}`);
    console.log(`  ${colors.green}✓ ${processed} videos processed${colors.reset}`);
    if (failed > 0) {
        console.log(`  ${colors.red}✗ ${failed} videos failed${colors.reset}`);
    }
    console.log('='.repeat(60) + '\n');

    await prisma.$disconnect();
}

// Run
main().catch(async (error) => {
    console.error('Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
});
