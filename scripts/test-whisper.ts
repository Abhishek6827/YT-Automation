/**
 * Simple test to check if Replicate Whisper is working
 */
import 'dotenv/config';
import Replicate from 'replicate';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

async function test() {
    console.log('🔍 Testing Replicate Whisper API...\n');
    console.log('Token:', process.env.REPLICATE_API_TOKEN?.slice(0, 10) + '...');

    // Use a short public audio sample
    const testAudioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    console.log('\n⏳ Starting transcription (this may take 30-60 seconds)...');
    const startTime = Date.now();

    try {
        const output = await replicate.run(
            "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
            {
                input: {
                    audio: testAudioUrl,
                    model: "base",
                    transcription: "plain text",
                }
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ SUCCESS! Took ${elapsed} seconds`);
        console.log('\n📝 Transcript:');
        console.log(JSON.stringify(output, null, 2));

    } catch (error) {
        console.log('\n❌ FAILED:', error);
    }
}

test();
