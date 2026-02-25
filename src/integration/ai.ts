import { ENV } from "@configs/env";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

export async function runAiAnalysis(text: string): Promise<string|null> {
    console.log("in ai");
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Summarize this text:\n\n${text}` }]
    });
    console.log("response", response);
    return response.choices[0].message.content;
}
