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

Generate the following in JSON format:
{
  "title": "An engaging, SEO-friendly title (max 100 chars)",
  "description": "A compelling description with relevant keywords (200-500 chars). Include call to action.",
  "tags": ["array", "of", "relevant", "tags", "max 10 tags"]
}

Rules:
- Title should be catchy and include keywords
- Description should be engaging and include relevant hashtags at the end
- Tags should be relevant trending keywords
- Make it suitable for YouTube's algorithm
- Only respond with valid JSON, no other text`;

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
