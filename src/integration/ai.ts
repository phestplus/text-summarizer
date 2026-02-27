import { ENV } from '@/configs/env';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

export async function runAiAnalysis(text: string): Promise<string | null> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Summarize this text:\n\n${text}` }],
  });
  return response.choices[0].message.content;
}
