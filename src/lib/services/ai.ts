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

    const prompt = `${basePrompt}

Based on the video file name: "${fileName}"

You are an expert YouTube Strategist specializing in Viral Shorts. Your goal is to maximize CTR (Click Through Rate) and Retention.

Analyze the likely content from the filename and generate metadata that triggers curiosity, emotion, or shock.

Generate the following in JSON format:
{
  "title": "A viral, punchy title (max 60 chars). Use CAPS for emphasis but don't overdo it. No clickbait that lies.",
  "description": "A compelling description (3-4 lines). Start with a hook. ends with: \\n\\nSUBSCRIBE for more!\\n#shorts #viral #trending #[TopicRelatedTag]",
  "tags": ["shorts", "viral", "fyp", "trending", "plus 5-10 specific niche tags"]
}

Guidelines for Title:
- Under 60 characters is best for Shorts.
- Use strong verbs and emotional triggers.
- Example: "You Won't Believe This!", "Satisfying Art 🎨", "He Actually Did It..."

Guidelines for Description:
- First line must be the hook.
- Include relevant hashtags.

Only respond with valid JSON.`;

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
        return {
            title: (metadata.title || fileName).slice(0, 100),
            description: (metadata.description || '').slice(0, 5000),
            tags: Array.isArray(metadata.tags)
                ? metadata.tags.slice(0, 10).map(t => String(t).slice(0, 30))
                : [],
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
