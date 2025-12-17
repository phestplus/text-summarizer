import OpenAI from "openai";
import fs from "fs";
import { ENV } from "@configs/env";

const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

export async function summarizeText(text: string): Promise<string> {
    console.log("in ai");
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Summarize this text:\n\n${text}` }]
    });
    console.log("response", response);
    return response.choices[0].message.content;
}

export async function summarizeTextFile(filePath: string): Promise<string> {
    const text = fs.readFileSync(filePath, "utf8");
    return summarizeText(text);
}
