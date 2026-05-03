import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const apiKey = process.env.ANTIGRAVITY_API_KEY || '';
let genAI: GoogleGenerativeAI | null = null;
let fileManager: GoogleAIFileManager | null = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  fileManager = new GoogleAIFileManager(apiKey);
}

export async function transcribeVoice(fileLink: string): Promise<string> {
  if (!genAI || !fileManager) {
    throw new Error('ANTIGRAVITY_API_KEY is not set. Cannot use voice transcription.');
  }

  const tmpPath = join(tmpdir(), `xia-voice-${Date.now()}.ogg`);
  
  try {
    // 1. Download file
    const res = await fetch(fileLink);
    if (!res.ok) throw new Error(`Failed to download voice file: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(tmpPath, buffer);

    // 2. Upload to Gemini
    const uploadResult = await fileManager.uploadFile(tmpPath, {
      mimeType: 'audio/ogg',
    });

    // 3. Extract intent
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([
      { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
      { text: "This is a voice command to an AI orchestration system. Transcribe and return ONLY the user's intent as a clean instruction string. No explanation. No markdown formatting. Just the raw instruction." }
    ]);
    
    const intent = result.response.text().trim();

    // 4. Cleanup remote file in background
    fileManager.deleteFile(uploadResult.file.name).catch(e => {
        console.error(`Failed to delete remote file ${uploadResult.file.name}:`, e);
    });

    return intent;

  } finally {
    // 5. Cleanup local temp file
    try {
      unlinkSync(tmpPath);
    } catch (e) {}
  }
}
