import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Gemini 3 Pro Image — internally branded "Nano Banana Pro".
 *
 * PINNED to gemini-3-pro-image-preview by user requirement: results are noticeably
 * worse on Nano Banana 2 / Thinking / Fast / Flash variants. Never auto-fallback.
 */
const MODEL = "gemini-3-pro-image-preview";

export interface RefImage {
  base64: string;
  mimeType: string;
}

export interface GenerateImageArgs {
  apiKey: string;
  prompt: string;
  referenceImages?: RefImage[];
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Generate a single image. Returns raw PNG bytes ready to upload to storage.
 * Throws if the model returns no image content (which happens on safety blocks).
 */
export async function generateImage({
  apiKey,
  prompt,
  referenceImages = [],
}: GenerateImageArgs): Promise<GeneratedImage> {
  const ai = new GoogleGenAI({ apiKey });

  // Reference images go FIRST in the parts array. Documented behavior is that the model
  // anchors more strongly on whatever leads the multi-modal input — putting the prompt
  // last makes it act like an instruction overlay on the visual rather than a competing
  // description.
  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
  for (const ref of referenceImages) {
    parts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          bytes: Buffer.from(part.inlineData.data, "base64"),
          mimeType: part.inlineData.mimeType ?? "image/png",
        };
      }
    }
  }

  throw new Error(
    "Gemini returned no image. Likely a safety block or empty response — try a less ambiguous prompt or different reference.",
  );
}

