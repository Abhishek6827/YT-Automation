import { GoogleGenerativeAI } from '@google/generative-ai';

// Note: GoogleGenerativeAI is instantiated per-call to ensure runtime env vars are used

export interface VideoMetadata {
    title: string;
    description: string;
    tags: string[];
}

// Generate metadata for a video based on its filename
export async function generateVideoMetadata(
    fileName: string,
    customPrompt?: string
): Promise<VideoMetadata> {
    // Check API key at call time
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[AI] GEMINI_API_KEY is not set!');
        return {
            title: `[AI Failed] ${fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim()}`.slice(0, 100),
            description: `Check out this video!\n\n#shorts #viral #trending`,
            tags: ['shorts', 'viral', 'trending', 'video'],
        };
    }

    console.log(`[AI] Generating metadata for: ${fileName}, API key length: ${apiKey.length}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Add randomization elements for unique generation
    const randomSeed = Math.random().toString(36).substring(7);
    const titleStyles = [
        'suspense/mystery', 'humor/comedy', 'emotional/heartfelt',
        'shocking/surprising', 'satisfying/relaxing', 'motivational/inspiring'
    ];
    const randomStyle = titleStyles[Math.floor(Math.random() * titleStyles.length)];
    const randomEmojis = ['😱', '💀', '🔥', '✨', '😭', '🤯', '👀', '💪', '🎯', '💯', '😂', '🙌'];
    const selectedEmojis = randomEmojis.sort(() => 0.5 - Math.random()).slice(0, 3).join('');

    const prompt = `You are a TOP YouTube Shorts creator with 10M+ subscribers. Generate UNIQUE viral metadata.

SEED: ${randomSeed} (use this to ensure uniqueness)
STYLE: ${randomStyle}
SUGGESTED EMOJIS: ${selectedEmojis}

VIDEO FILE: "${fileName}"

CRITICAL RULES:
1. NEVER use the filename as title - create something ORIGINAL
2. Each generation must be COMPLETELY DIFFERENT - use the seed for randomness
3. Match the ${randomStyle} style for this video
4. Title max 100 chars, but keep it punchy (40-60 chars ideal)

Generate JSON:
{
  "title": "Unique viral title using ${randomStyle} style with emojis",
  "description": "Engaging description (max 200 chars). Hook the viewer. End with: Subscribe for more amazing content! Then add 5 relevant hashtags.",
  "tags": ["15-20 unique tags relevant to shorts content, each tag max 30 chars"]
}

YOUTUBE LIMITS TO FOLLOW:
- Title: max 100 characters
- Description: max 5000 characters  
- Tags: max 500 characters TOTAL (all tags combined)
- Each individual tag: max 30 characters

TITLE EXAMPLES for ${randomStyle}:
${randomStyle === 'suspense/mystery' ? '- "Wait for the ending... 😱"\n- "Nobody saw this coming 💀"\n- "The last second changed everything"' : ''}
${randomStyle === 'humor/comedy' ? '- "I can\'t stop laughing 😂"\n- "This is so relatable 💀"\n- "POV: Every time without fail"' : ''}
${randomStyle === 'emotional/heartfelt' ? '- "This hit different 😭"\n- "I wasn\'t expecting to cry ✨"\n- "Faith in humanity restored"' : ''}
${randomStyle === 'shocking/surprising' ? '- "How is this even possible?! 🤯"\n- "I had to watch this 5 times"\n- "This broke the internet 🔥"' : ''}
${randomStyle === 'satisfying/relaxing' ? '- "So satisfying to watch ✨"\n- "I could watch this forever"\n"Peak satisfaction 💯"' : ''}
${randomStyle === 'motivational/inspiring' ? '- "This changed my mindset 💪"\n- "Watch this when you need motivation"\n- "Never give up 🔥"' : ''}

Output ONLY valid JSON. Be creative and UNIQUE!`;


    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const metadata = JSON.parse(jsonMatch[0]) as VideoMetadata;

        // Validate and sanitize with YouTube limits
        let tags = Array.isArray(metadata.tags)
            ? metadata.tags.map(t => String(t).trim().replace(/^#/, '').slice(0, 30)) // Each tag max 30 chars
            : [];

        // Enforce 500 char total limit for all tags
        let totalChars = 0;
        const limitedTags: string[] = [];
        for (const tag of tags) {
            if (totalChars + tag.length + 1 <= 500) { // +1 for comma separator
                limitedTags.push(tag);
                totalChars += tag.length + 1;
            } else {
                break;
            }
        }

        return {
            title: (metadata.title || fileName).slice(0, 100), // YouTube title limit
            description: (metadata.description || '').slice(0, 5000), // YouTube description limit
            tags: limitedTags,
        };
    } catch (error) {
        // Detailed error logging for debugging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('[AI] Error generating metadata:', {
            message: errorMessage,
            stack: errorStack?.slice(0, 500),
            apiKeySet: !!process.env.GEMINI_API_KEY,
            apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
            fileName: fileName
        });

        // Fallback metadata - include [AI FAILED] prefix to indicate fallback
        const cleanName = fileName
            .replace(/\.[^/.]+$/, '') // Remove extension
            .replace(/[_-]/g, ' ')    // Replace underscores/dashes with spaces
            .trim();

        return {
            title: `[AI Failed] ${cleanName}`.slice(0, 100),
            description: `Check out this video: ${cleanName}\n\n#shorts #viral #trending`,
            tags: ['shorts', 'viral', 'trending', 'video'],
        };
    }
}

// Generate metadata from audio transcript (Whisper transcription)
export async function generateMetadataFromTranscript(
    transcript: string,
    fileName: string
): Promise<VideoMetadata> {
    // Check API key at call time
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[AI] GEMINI_API_KEY is not set!');
        return generateVideoMetadata(fileName); // Fallback to filename-based
    }

    console.log(`[AI] Generating metadata from transcript, length: ${transcript.length}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Add randomization for variety
    const randomSeed = Math.random().toString(36).substring(7);
    const randomEmojis = ['😱', '💀', '🔥', '✨', '😭', '🤯', '👀', '💪', '🎯', '💯', '😂', '🙌'];
    const selectedEmojis = randomEmojis.sort(() => 0.5 - Math.random()).slice(0, 4).join('');

    const prompt = `You are a TOP YouTube Shorts creator with 10M+ subscribers. Generate VIRAL metadata based on actual video content.

SEED: ${randomSeed}
EMOJIS: ${selectedEmojis}

## ACTUAL VIDEO TRANSCRIPT:
"${transcript.slice(0, 2000)}"

## YOUR TASK:
Based on the transcript above, create YouTube metadata that:
1. Captures the MAIN TOPIC or HOOK from the spoken content
2. Creates curiosity without giving everything away
3. Uses emotional triggers matching the content tone

Generate JSON:
{
  "title": "Catchy title based on transcript content (max 60 chars, use emojis)",
  "description": "Hook sentence summarizing video content. What viewers will learn/see. Call to action. Then 5 relevant hashtags.",
  "tags": ["15-20 specific tags based on transcript topics, each max 30 chars"]
}

YOUTUBE LIMITS:
- Title: max 100 characters (aim for 40-60)
- Tags: max 500 characters TOTAL
- Each tag: max 30 characters

Output ONLY valid JSON. Make it VIRAL!`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const metadata = JSON.parse(jsonMatch[0]) as VideoMetadata;

        // Validate and sanitize
        let tags = Array.isArray(metadata.tags)
            ? metadata.tags.map(t => String(t).trim().replace(/^#/, '').slice(0, 30))
            : [];

        let totalChars = 0;
        const limitedTags: string[] = [];
        for (const tag of tags) {
            if (totalChars + tag.length + 1 <= 500) {
                limitedTags.push(tag);
                totalChars += tag.length + 1;
            } else break;
        }

        console.log('[AI] Generated metadata from transcript:', metadata.title);
        return {
            title: (metadata.title || fileName).slice(0, 100),
            description: (metadata.description || '').slice(0, 5000),
            tags: limitedTags,
        };
    } catch (error) {
        console.error('[AI] Error generating from transcript, falling back to filename:', error);
        // Fallback to filename-based generation
        return generateVideoMetadata(fileName);
    }
}
