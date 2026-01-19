import { AssemblyAI } from 'assemblyai';

// Initialize AssemblyAI client
function getClient() {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        throw new Error('ASSEMBLYAI_API_KEY not set');
    }
    return new AssemblyAI({ apiKey });
}

export interface TranscriptionResult {
    success: boolean;
    transcript?: string;
    error?: string;
}

/**
 * Transcribe audio/video using AssemblyAI (FREE tier: 3 hours/month)
 * @param audioUrl - Public URL of the audio/video file OR base64 data
 */
export async function transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptionResult> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        console.log('[AssemblyAI] No API key set, skipping transcription');
        return { success: false, error: 'ASSEMBLYAI_API_KEY not configured' };
    }

    try {
        console.log('[AssemblyAI] Starting transcription...');
        const client = getClient();

        const transcript = await client.transcripts.transcribe({
            audio: audioUrl,
            language_detection: true,
        });

        if (transcript.status === 'error') {
            return { success: false, error: transcript.error || 'Transcription failed' };
        }

        if (!transcript.text) {
            return { success: false, error: 'No text in transcript' };
        }

        console.log('[AssemblyAI] Transcription successful, length:', transcript.text.length);
        return { success: true, transcript: transcript.text };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[AssemblyAI] Error:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Upload a file buffer to AssemblyAI for transcription
 */
export async function uploadAndTranscribe(buffer: Buffer): Promise<TranscriptionResult> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        return { success: false, error: 'ASSEMBLYAI_API_KEY not configured' };
    }

    try {
        console.log('[AssemblyAI] Uploading file...');
        const client = getClient();

        // Upload the file
        const uploadUrl = await client.files.upload(buffer);
        console.log('[AssemblyAI] File uploaded, transcribing...');

        // Transcribe
        const transcript = await client.transcripts.transcribe({
            audio: uploadUrl,
            language_detection: true,
        });

        if (transcript.status === 'error') {
            return { success: false, error: transcript.error || 'Transcription failed' };
        }

        if (!transcript.text) {
            return { success: false, error: 'No text in transcript' };
        }

        console.log('[AssemblyAI] Success! Text length:', transcript.text.length);
        return { success: true, transcript: transcript.text };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[AssemblyAI] Error:', errorMessage);
        return { success: false, error: errorMessage };
    }
}
