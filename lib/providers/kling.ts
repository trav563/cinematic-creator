import crypto from "node:crypto";

/**
 * Kling official API client (api-singapore.klingai.com).
 *
 * Auth: HS256 JWT signed per-request with the access_key as `iss` and the secret_key
 * as the HMAC secret. The credential we store is the literal string "access:secret"
 * — splitting on the first colon gives us both halves.
 *
 * Contract sourced from kling-docs/apiReference_2Fmodel_2FimageToVideo.md and
 * apiReference_2Fmodel_2Felement.md (scraped from the official docs).
 *
 * Cost (Mar 2026 — verify against your Kling dashboard, prices change quarterly):
 *   - kling-v2-6 std 5s   ≈ $0.35
 *   - kling-v2-6 pro 5s   ≈ $0.70
 *   - kling-v3   std 5s   ≈ $0.50
 *   - kling-v3   pro 5s   ≈ $1.00
 *   - kling-v3   4k  5s   ≈ $2.50
 * Longer durations scale roughly linearly.
 */

const KLING_API = "https://api-singapore.klingai.com";

export type KlingModel = "kling-v2-6" | "kling-v3";
export type KlingMode = "std" | "pro" | "4k";
export type KlingDuration = "5" | "10" | "3" | "4" | "6" | "7" | "8" | "9" | "11" | "12" | "13" | "14" | "15";

export interface MultiPromptShot {
  index: number;
  prompt: string;
  duration: string;
}

export interface SubmitVideoArgs {
  credential: string; // "access:secret"
  model: KlingModel;
  mode: KlingMode;
  duration: KlingDuration;
  imageBase64: string; // raw base64, no data: prefix (we strip it defensively below)
  imageTailBase64?: string; // optional end-frame for PAIR scenes
  prompt: string;
  negativePrompt?: string;
  sound: "on" | "off";
  multiShot?: boolean;
  multiPrompt?: MultiPromptShot[];
  elementIds?: string[]; // up to 3 Kling element IDs
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface KlingTaskStatus {
  taskId: string;
  status: "submitted" | "processing" | "succeed" | "failed";
  videoUrl: string | null;
  error: string | null;
}

// Strips a `data:image/...;base64,` prefix if the caller forgot to. Kling rejects
// prefixed base64 with a 400 (per the imageToVideo doc).
function cleanBase64(input: string): string {
  return input.replace(/^data:image\/\w+;base64,/, "");
}

function parseCredential(credential: string): { accessKey: string; secretKey: string } {
  const idx = credential.indexOf(":");
  if (idx === -1) {
    throw new Error('Kling credential must be formatted as "access_key:secret_key".');
  }
  return {
    accessKey: credential.slice(0, idx),
    secretKey: credential.slice(idx + 1),
  };
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(accessKey: string, secretKey: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secretKey).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function klingFetch(
  path: string,
  credential: string,
  init: RequestInit = {},
): Promise<unknown> {
  const { accessKey, secretKey } = parseCredential(credential);
  const jwt = signJwt(accessKey, secretKey);
  const res = await fetch(`${KLING_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Kling ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(
      `Kling ${path} failed (${res.status}): ${(body as { message?: string }).message ?? text.slice(0, 200)}`,
    );
  }
  return body;
}

// ============ Capability validation ============

export interface ValidateOptionsArgs {
  model: KlingModel;
  mode: KlingMode;
  duration: KlingDuration;
  sound: "on" | "off";
  multiShot?: boolean;
  multiPrompt?: MultiPromptShot[];
  elementIds?: string[];
}

/**
 * Throws a user-readable error if the requested combination violates Kling's capability
 * matrix (kling-docs/apiReference_2Fmodel_2FvideoModels.md). The UI also enforces these
 * client-side, but we double-check on the server before paying for an API call.
 */
export function validateOptions(opts: ValidateOptionsArgs): void {
  if (opts.model === "kling-v2-6") {
    if (opts.mode === "4k") {
      throw new Error("Kling 2.6 does not support 4K mode. Use Kling 3.0 for 4K.");
    }
    if (opts.mode === "std" && opts.sound === "on") {
      throw new Error(
        "Kling 2.6 Standard mode is no-audio only. Switch to Pro mode (1080p) to enable audio.",
      );
    }
    if (opts.multiShot) {
      throw new Error("Multi-shot is only supported on Kling 3.0.");
    }
    if (opts.duration !== "5" && opts.duration !== "10") {
      throw new Error("Kling 2.6 only supports 5s or 10s durations.");
    }
  }
  if (opts.model === "kling-v3") {
    const dur = parseInt(opts.duration, 10);
    if (dur < 3 || dur > 15) {
      throw new Error("Kling 3.0 supports durations 3–15 seconds.");
    }
  }
  if (opts.multiShot) {
    if (!opts.multiPrompt || opts.multiPrompt.length === 0) {
      throw new Error("Multi-shot requires at least one storyboard.");
    }
    if (opts.multiPrompt.length > 6) {
      throw new Error("Multi-shot supports at most 6 storyboards.");
    }
    const sum = opts.multiPrompt.reduce((acc, s) => acc + parseInt(s.duration, 10), 0);
    const total = parseInt(opts.duration, 10);
    if (sum !== total) {
      throw new Error(
        `Storyboard durations must sum to the total duration (${total}s). Currently ${sum}s.`,
      );
    }
  }
  if (opts.elementIds && opts.elementIds.length > 3) {
    throw new Error("Kling allows at most 3 elements per video.");
  }
}

// ============ Image-to-video ============

interface KlingSubmitResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    task_status: string;
  };
}

export async function submitImageToVideo(args: SubmitVideoArgs): Promise<string> {
  validateOptions(args);

  const body: Record<string, unknown> = {
    model_name: args.model,
    mode: args.mode,
    duration: args.duration,
    image: cleanBase64(args.imageBase64),
    sound: args.sound,
  };

  if (args.imageTailBase64) {
    body.image_tail = cleanBase64(args.imageTailBase64);
  }
  if (args.negativePrompt) body.negative_prompt = args.negativePrompt;
  if (args.aspectRatio) body.aspect_ratio = args.aspectRatio;

  if (args.multiShot && args.multiPrompt && args.multiPrompt.length) {
    body.multi_shot = true;
    body.shot_type = "customize";
    body.multi_prompt = args.multiPrompt;
    // When multi_shot is true, the single `prompt` field is invalid per docs.
  } else {
    body.prompt = args.prompt;
  }

  if (args.elementIds && args.elementIds.length) {
    body.element_list = args.elementIds.map((id) => ({ element_id: Number(id) }));
  }

  const response = (await klingFetch("/v1/videos/image2video", args.credential, {
    method: "POST",
    body: JSON.stringify(body),
  })) as KlingSubmitResponse;

  if (response.code !== 0 || !response.data?.task_id) {
    throw new Error(`Kling submit returned code=${response.code}: ${response.message}`);
  }
  return response.data.task_id;
}

interface KlingPollResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{ url: string; duration: string }>;
    };
  };
}

export async function pollTask(
  credential: string,
  taskId: string,
): Promise<KlingTaskStatus> {
  const response = (await klingFetch(
    `/v1/videos/image2video/${taskId}`,
    credential,
  )) as KlingPollResponse;

  if (response.code !== 0) {
    throw new Error(`Kling poll returned code=${response.code}: ${response.message}`);
  }
  const { task_status, task_status_msg, task_result } = response.data;
  return {
    taskId,
    status: task_status,
    videoUrl: task_result?.videos?.[0]?.url ?? null,
    error: task_status === "failed" ? task_status_msg ?? "unknown failure" : null,
  };
}

export async function downloadVideoBytes(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Kling video (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "video/mp4";
  return { bytes, mimeType };
}

// ============ Element creation (for character consistency) ============

export interface CreateElementArgs {
  credential: string;
  elementName: string; // ≤20 chars per docs
  elementDescription: string; // ≤100 chars
  frontalImageBase64: string;
  additionalImageBase64s?: string[]; // 0-3 additional reference angles
}

export async function submitCreateElement(args: CreateElementArgs): Promise<string> {
  // Element name has a hard 20-char cap and description has a 100-char cap per docs.
  // Trim defensively rather than letting the API reject the request.
  const body: Record<string, unknown> = {
    element_name: args.elementName.slice(0, 20),
    element_description: args.elementDescription.slice(0, 100),
    reference_type: "image_refer",
    element_image_list: {
      frontal_image: cleanBase64(args.frontalImageBase64),
      refer_images:
        args.additionalImageBase64s?.slice(0, 3).map((img) => ({
          image_url: cleanBase64(img),
        })) ?? [],
    },
    // o_102 = Character per the tag_list table in element.md
    tag_list: [{ tag_id: "o_102" }],
  };

  const response = (await klingFetch("/v1/general/advanced-custom-elements", args.credential, {
    method: "POST",
    body: JSON.stringify(body),
  })) as KlingSubmitResponse;

  if (response.code !== 0 || !response.data?.task_id) {
    throw new Error(`Kling element create returned code=${response.code}: ${response.message}`);
  }
  return response.data.task_id;
}

interface KlingElementPollResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_result?: {
      elements?: Array<{
        element_id: number;
        element_name: string;
        element_description: string;
      }>;
    };
  };
}

export interface KlingElementStatus {
  taskId: string;
  status: "submitted" | "processing" | "succeed" | "failed";
  elementId: string | null; // number from Kling, stored as string to avoid bigint surprises
  error: string | null;
}

export async function pollElementTask(
  credential: string,
  taskId: string,
): Promise<KlingElementStatus> {
  const response = (await klingFetch(
    `/v1/general/advanced-custom-elements/${taskId}`,
    credential,
  )) as KlingElementPollResponse;

  if (response.code !== 0) {
    throw new Error(`Kling element poll returned code=${response.code}: ${response.message}`);
  }
  const { task_status, task_status_msg, task_result } = response.data;
  const elementId = task_result?.elements?.[0]?.element_id;
  return {
    taskId,
    status: task_status,
    elementId: elementId !== undefined ? String(elementId) : null,
    error: task_status === "failed" ? task_status_msg ?? "unknown failure" : null,
  };
}

// ============ Cost estimation (units + USD) ============

// Unit costs from kling-docs/productBilling_2FprePaidResourcePackage.md.
// Kling 2.6 is priced per fixed clip duration (5s or 10s).
// Kling 3.0 is priced per second.
//
// Each unit ≈ $0.14 USD at face-value pricing (1.5 units = $0.21 → 0.14/unit).

const USD_PER_UNIT = 0.14;

interface UnitCalc {
  units: number;
}

/**
 * Returns the unit cost of a single Kling video generation given the chosen options.
 * Numbers verified against the official pricing table (Mar 2026 — verify against your
 * Kling dashboard since they adjust quarterly).
 */
export function estimateUnits(args: {
  model: KlingModel;
  mode: KlingMode;
  durationSeconds: number;
  sound: "on" | "off";
}): UnitCalc {
  const { model, mode, durationSeconds, sound } = args;

  if (model === "kling-v2-6") {
    // Kling 2.6 is priced for 5s or 10s clips only.
    const isLong = durationSeconds >= 10;
    if (mode === "std") {
      // std mode is no-audio only.
      return { units: isLong ? 3 : 1.5 };
    }
    if (mode === "pro") {
      if (sound === "on") {
        return { units: isLong ? 10 : 5 };
      }
      return { units: isLong ? 5 : 2.5 };
    }
    return { units: 0 }; // 4k unsupported on 2.6
  }

  if (model === "kling-v3") {
    // Kling 3.0 is priced per second.
    let perSecond = 0;
    if (mode === "std") perSecond = sound === "on" ? 0.9 : 0.6;
    else if (mode === "pro") perSecond = sound === "on" ? 1.2 : 0.8;
    else if (mode === "4k") perSecond = 3; // 4K is the same price with or without audio
    return { units: perSecond * durationSeconds };
  }

  return { units: 0 };
}

export function unitsToUsd(units: number): number {
  return units * USD_PER_UNIT;
}

/**
 * Convenience: dollars for a single generation. Kept for backwards compatibility with
 * existing callers — internally just goes through estimateUnits + unitsToUsd.
 */
export function estimateCostUsd(
  model: KlingModel,
  mode: KlingMode,
  durationSeconds: number,
  sound: "on" | "off" = "off",
): number {
  return unitsToUsd(estimateUnits({ model, mode, durationSeconds, sound }).units);
}

// ============ Account balance ============

interface KlingBalanceResponse {
  code: number;
  message: string;
  data: {
    code: number;
    msg: string;
    resource_pack_subscribe_infos: Array<{
      resource_pack_name: string;
      resource_pack_id: string;
      resource_pack_type: string;
      total_quantity: number;
      remaining_quantity: number;
      purchase_time: number;
      effective_time: number;
      invalid_time: number;
      status: "toBeOnline" | "online" | "expired" | "runOut";
    }>;
  };
}

export interface KlingResourcePack {
  name: string;
  packId: string;
  total: number;
  remaining: number;
  status: "toBeOnline" | "online" | "expired" | "runOut";
  expiresAt: number;
}

export interface KlingBalanceSummary {
  packs: KlingResourcePack[];
  // Sum of remaining_quantity across packs that are currently 'online' (active and
  // usable). Stale by up to ~12h per the docs.
  remainingActive: number;
}

export async function fetchAccountBalance(credential: string): Promise<KlingBalanceSummary> {
  // Per docs, start_time / end_time are required. Use a 1-year window centered on now.
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    start_time: String(now - oneYear),
    end_time: String(now + oneYear),
  });

  const response = (await klingFetch(
    `/account/costs?${params}`,
    credential,
  )) as KlingBalanceResponse;

  if (response.code !== 0 || response.data?.code !== 0) {
    throw new Error(
      `Kling balance fetch returned code=${response.code} (inner=${response.data?.code}): ${response.message ?? response.data?.msg}`,
    );
  }
  const packs: KlingResourcePack[] = (response.data.resource_pack_subscribe_infos ?? []).map((p) => ({
    name: p.resource_pack_name,
    packId: p.resource_pack_id,
    total: p.total_quantity,
    remaining: p.remaining_quantity,
    status: p.status,
    expiresAt: p.invalid_time,
  }));
  const remainingActive = packs
    .filter((p) => p.status === "online")
    .reduce((sum, p) => sum + p.remaining, 0);
  return { packs, remainingActive };
}
