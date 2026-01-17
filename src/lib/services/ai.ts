import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const basePrompt = customPrompt || `You are a YouTube content creator assistant. Generate engaging metadata for a video.`;

    const prompt = `You are a TOP YouTube Shorts creator with 10M+ subscribers. Your videos go VIRAL because of amazing titles.

TASK: Generate viral YouTube Shorts metadata.

VIDEO FILENAME: "${fileName}"

IMPORTANT RULES:
1. The filename might be generic (like "video_001.mp4" or "subtitle (5).mp4"). DO NOT use the filename literally as title.
2. Instead, CREATE an original, catchy, curiosity-inducing title as if YOU made this viral short.
3. Think: What makes people click? Mystery, emotion, surprise, relatability, humor.

Generate JSON with:
{
  "title": "VIRAL title (max 50 chars). Examples: 'Wait for it... 😱', 'Nobody Expected THIS 💀', 'POV: You finally did it ✨', 'This changes everything 🔥'",
  "description": "Hook sentence + context + call to action. End with: SUBSCRIBE for more! Include 3-5 hashtags",
  "tags": ["shorts", "viral", "fyp", "trending", "satisfying", "relatable", "pov", "mustwatch"]
}

TITLE STYLES THAT WORK:
- "Wait for it..." (builds suspense)
- "POV: [relatable situation]" (personal)
- "Nobody expected THIS" (surprise)
- "When [situation] hits different" (relatable)
- "He actually did it 💀" (reaction)
- Use emojis: 😱💀🔥✨😭🤯

NEVER:
- Use the raw filename as title
- Say "english subtitle" or any technical terms
- Be boring or generic

Output ONLY valid JSON.`;


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

        // Validate and sanitize
        // YouTube allows max 500 characters TOTAL for all tags combined
        let tags = Array.isArray(metadata.tags)
            ? metadata.tags.map(t => String(t).trim().replace(/^#/, '')) // Remove # prefix if present
            : [];

        // Enforce 500 char total limit
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
            title: (metadata.title || fileName).slice(0, 100),
            description: (metadata.description || '').slice(0, 5000),
            tags: limitedTags,
        };
    } catch (error) {
        console.error('Error generating metadata:', error);

        // Fallback metadata
        const cleanName = fileName
            .replace(/\.[^/.]+$/, '') // Remove extension
            .replace(/[_-]/g, ' ')    // Replace underscores/dashes with spaces
            .trim();

        return {
            title: cleanName.slice(0, 100),
            description: `Check out this video: ${cleanName}\n\n#shorts #viral #trending`,
            tags: ['shorts', 'viral', 'trending', 'video'],
        };
    }
}
