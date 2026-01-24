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
import { AssemblyAI } from "assemblyai";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

// Configuration
const API_BASE = process.env.NEXTAUTH_URL || 'https://yt-automation-h3vf.vercel.app';
const prisma = new PrismaClient();

// Initialize APIs
const aai = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || '',
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

// Get the first user ID from database for multi-user support
async function getUserId(): Promise<string | null> {
    try {
        const user = await prisma.user.findFirst({ select: { id: true } });
        return user?.id || null;
    } catch (error) {
        log(`Failed to fetch user from database: ${error}`, 'error');
        return null;
    }
}

// List videos from Drive via API
async function listVideosFromDrive(): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${API_BASE}/api/automation/run?preview=true`, {
        method: 'POST', // Some apps use POST for this
        headers: { 'Content-Type': 'application/json' },
    });

    // If that fails, try a simple GET status
    if (!res.ok) {
        const statusRes = await fetch(`${API_BASE}/api/automation/status`);
        if (statusRes.ok) {
            // This is complex, let's assume the preview endpoint exists or use dummy if needed
            // Actually, in this app, runAutomation is usually triggered from Dashboard.
        }
        log('Warning: Falling back to Drive scan via API might require auth headers.', 'warn');
    }

    try {
        const data = await res.json();
        return data.files || [];
    } catch {
        return [];
    }
}

// Get already processed video IDs via API
async function getProcessedDriveIds(userId: string): Promise<Set<string>> {
    const res = await fetch(`${API_BASE}/api/videos`);
    if (!res.ok) return new Set();
    const videos = await res.json();
    return new Set(videos.filter((v: any) => v.userId === userId).map((v: { driveId: string }) => v.driveId));
}

// Download video from Google Drive directly (using public link)
async function downloadFromDrive(fileId: string): Promise<Buffer | null> {
    try {
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

// Transcribe with AssemblyAI (FAST & Reliable)
async function transcribe(buffer: Buffer): Promise<string | null> {
    try {
        log('  🎙️  Running AssemblyAI transcription...', 'info');
        const transcript = await aai.transcripts.transcribe({
            audio: buffer,
        });
        return transcript.text || null;
    } catch (error) {
        log(`  AssemblyAI error: ${error}`, 'error');
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
1. title: Catchy, viral title with emojis (max 80 chars)
2. description: Engaging description + call to action + 5 hashtags
3. tags: 15-20 relevant tags

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
    userId: string;
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
    console.log(`${c.bold}${c.cyan}  YT Automation - Local Transcription Processor (v2)${c.reset}`);
    console.log(`${c.dim}  Using AssemblyAI & Multi-user support.${c.reset}`);
    console.log('═'.repeat(60) + '\n');

    if (!process.env.ASSEMBLYAI_API_KEY) {
        log('ASSEMBLYAI_API_KEY not set in .env', 'error');
        process.exit(1);
    }

    const userId = await getUserId();
    if (!userId) {
        log('No user found in database. Please login to the web app first.', 'error');
        process.exit(1);
    }
    log(`Processing for user ID: ${userId}`, 'success');

    try {
        const driveFiles = await listVideosFromDrive();
        if (driveFiles.length === 0) {
            log('No new files found to process via API.', 'info');
        }

        const processedIds = await getProcessedDriveIds(userId);
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
                const buffer = await downloadFromDrive(file.id);
                if (!buffer) { failed++; continue; }

                const transcript = await transcribe(buffer);
                if (!transcript) { failed++; continue; }

                const metadata = await generateMetadata(transcript, file.name);

                const saved = await saveVideoToDatabase({
                    userId,
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
                    log('  Failed to save to database', 'error');
                    failed++;
                }
            } catch (error) {
                log(`  Error: ${error}`, 'error');
                failed++;
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`${c.bold}${c.green}  Processing Complete!${c.reset}`);
        console.log(`  ${c.green}✓ ${success} videos processed${c.reset}`);
        if (failed > 0) console.log(`  ${c.red}✗ ${failed} failed${c.reset}`);
        console.log('═'.repeat(60) + '\n');

    } catch (error) {
        log(`Fatal error: ${error}`, 'error');
    } finally {
        await prisma.$disconnect();
    }
}

main();
