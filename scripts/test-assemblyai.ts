/**
 * Test AssemblyAI transcription
 * Run: npx tsx scripts/test-assemblyai.ts
 */
import 'dotenv/config';
import { AssemblyAI } from 'assemblyai';

async function test() {
    console.log('🔍 Testing AssemblyAI Transcription...\n');

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        console.log('❌ ASSEMBLYAI_API_KEY not set in .env');
        console.log('\nTo get a FREE API key:');
        console.log('1. Go to https://www.assemblyai.com/');
        console.log('2. Sign up for free (no credit card required)');
        console.log('3. Copy your API key from the dashboard');
        console.log('4. Add to .env: ASSEMBLYAI_API_KEY="your-key-here"');
        return;
    }

    console.log('API Key:', apiKey.slice(0, 10) + '...');

    try {
        const client = new AssemblyAI({ apiKey });

        // Test with a short public audio sample
        const testUrl = 'https://storage.googleapis.com/aai-web-samples/5_common_sports_injuries.mp3';

        console.log('\n⏳ Starting transcription (may take 30-60 seconds)...');
        const startTime = Date.now();

        const transcript = await client.transcripts.transcribe({
            audio: testUrl,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (transcript.status === 'completed' && transcript.text) {
            console.log(`\n✅ SUCCESS! Took ${elapsed} seconds`);
            console.log('\n📝 Transcript preview:');
            console.log(transcript.text.slice(0, 500) + '...');
        } else {
            console.log('\n❌ Failed:', transcript.error || 'Unknown error');
        }

    } catch (error) {
        console.log('\n❌ Error:', error);
    }
}

test();
