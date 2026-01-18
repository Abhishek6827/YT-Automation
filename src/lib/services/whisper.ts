import Replicate from 'replicate';

// Initialize Replicate client
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

export interface TranscriptionResult {
    success: boolean;
    transcript?: string;
    error?: string;
}

/**
 * Transcribe audio/video using Whisper via Replicate API
 * @param audioUrl - Public URL of the audio/video file
 * @returns Transcription result with text
 */
export async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    if (!process.env.REPLICATE_API_TOKEN) {
        console.log('[Whisper] No REPLICATE_API_TOKEN set, skipping transcription');
        return { success: false, error: 'REPLICATE_API_TOKEN not configured' };
    }

    try {
        console.log('[Whisper] Starting transcription for:', audioUrl);

        // Use openai/whisper model on Replicate (free tier available)
        const output = await replicate.run(
            "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
            {
                input: {
                    audio: audioUrl,
                    model: "base", // Use 'base' for faster processing, 'large-v3' for accuracy
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

        console.log('[Whisper] Raw output:', output);

        // Extract transcript from output
        const result = output as { transcription?: string; text?: string };
        const transcript = result.transcription || result.text || (typeof output === 'string' ? output : '');

        if (!transcript) {
            return { success: false, error: 'No transcript returned from Whisper' };
        }

        console.log('[Whisper] Transcription successful, length:', transcript.length);
        return { success: true, transcript: transcript.trim() };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Whisper] Transcription error:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Create a temporary public URL for a video buffer
 * For Replicate, we use their file upload feature
 */
export async function uploadForTranscription(videoBuffer: Buffer, fileName: string): Promise<string | null> {
    if (!process.env.REPLICATE_API_TOKEN) {
        return null;
    }

    try {
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        // Convert Buffer to ArrayBuffer then to Blob for compatibility
        const arrayBuffer = videoBuffer.buffer.slice(
            videoBuffer.byteOffset,
            videoBuffer.byteOffset + videoBuffer.length
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
        const file = new File([blob], fileName, { type: 'video/mp4' });

        // Upload to Replicate's file hosting
        const fileUrl = await replicate.files.create(file);
        console.log('[Whisper] Uploaded file for transcription:', fileUrl.urls?.get);

        return fileUrl.urls?.get || null;
    } catch (error) {
        console.error('[Whisper] Failed to upload file:', error);
        return null;
    }
}
