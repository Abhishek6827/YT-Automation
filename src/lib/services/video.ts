import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
// @ts-ignore
import { path as ffprobePath } from 'ffprobe-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

// Configure ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
} else {
    console.warn('[Video] ffmpeg-static not found, ffmpeg might not work if not in PATH');
}

if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
}

/**
 * Extract frames from a video file at regular intervals
 * @param videoPath Path to the video file
 * @param count Number of frames to extract
 * @returns Array of Buffer containing the image data
 */
export async function extractFrames(videoPath: string, count: number = 3): Promise<Buffer[]> {
    console.log(`[Video] Extracting ${count} frames from: ${videoPath}`);

    // Create a temporary directory for frames
    const tempDir = path.join(os.tmpdir(), `yt-automation-frames-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
        // Get video duration
        const duration = await getVideoDuration(videoPath);
        console.log(`[Video] Duration: ${duration} seconds`);

        if (!duration || duration < 1) {
            throw new Error('Invalid video duration');
        }

        // Calculate timestamps: 20%, 50%, 80% (or distributed evenly)
        // If count is 3, we want e.g. 20%, 50%, 80%
        // If count is 1, 50%
        // Generic formula: (i + 1) / (count + 1) * duration, or just spread them out.
        // Let's use equally spaced intervals avoiding start/end: 
        // e.g. count=3 -> 25%, 50%, 75%
        const timestamps = Array.from({ length: count }, (_, i) => {
            return (duration * (i + 1) / (count + 1));
        });

        const frameBuffers: Buffer[] = [];

        // Parallel extraction works, but let's do sequential to avoid heavy load/issues with single ffmpeg
        // Actually parallel is faster. fluent-ffmpeg can run multiple instances.
        // Let's use Promise.all
        const promises = timestamps.map(async (time, index) => {
            const outputPath = path.join(tempDir, `frame-${index}.jpg`);

            return new Promise<void>((resolve, reject) => {
                ffmpeg(videoPath)
                    .screenshots({
                        timestamps: [time],
                        filename: `frame-${index}.jpg`,
                        folder: tempDir,
                        size: '640x?' // Resize to reasonable width, keep aspect ratio
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });
        });

        await Promise.all(promises);

        // Read all frames back into buffers
        for (let i = 0; i < count; i++) {
            const framePath = path.join(tempDir, `frame-${i}.jpg`);
            if (fs.existsSync(framePath)) {
                const buffer = await fs.promises.readFile(framePath);
                frameBuffers.push(buffer);
            }
        }

        console.log(`[Video] Extracted ${frameBuffers.length} frames`);
        return frameBuffers;

    } catch (error) {
        console.error('[Video] Error extracting frames:', error);
        throw error;
    } finally {
        // Cleanup temp dir
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error('[Video] Error cleaning up temp dir:', cleanupError);
        }
    }
}

function getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                // Determine if we need to set ffprobe path too?
                // ffmpeg-static usually includes ffmpeg only.
                // fluent-ffmpeg tries to find ffprobe. 
                // We might need 'ffprobe-static' or just rely on ffmpeg to get duration.
                // Fallback: use ffmpeg to get duration if ffprobe fails/missing.
                reject(err);
            } else {
                resolve(metadata.format.duration || 0);
            }
        });
    });
}
