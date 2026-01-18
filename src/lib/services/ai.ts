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
        console.error('Error generating metadata:', error);
        console.error('GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);

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
