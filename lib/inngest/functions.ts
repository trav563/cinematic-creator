import { inngest } from "./client";
import { parseScriptFunction } from "./functions/parse-script";
import { generateAssetVariationFunction } from "./functions/generate-asset-variation";
import { proposeStoryboardFunction } from "./functions/propose-storyboard";
import { generateKeyframeFunction } from "./functions/generate-keyframe";
import { generateVideoFunction } from "./functions/generate-video";
import { bindAssetElementFunction } from "./functions/bind-asset-element";
import { generateMotionPromptsFunction } from "./functions/generate-motion-prompts";
import { derivePairedFrameFunction } from "./functions/derive-paired-frame";

/**
 * Smoke-test function for Phase 0. Sending an event with name "app/hello" via the
 * Inngest dev UI should produce a successful run that logs the payload.
 */
export const helloFunction = inngest.createFunction(
  {
    id: "hello",
    name: "Hello (smoke test)",
    triggers: [{ event: "app/hello" }],
  },
  async ({ event, step }) => {
    await step.run("log", async () => {
      console.log("Hello from Inngest", event.data);
    });
    return { received: event.data };
  },
);

export const functions = [
  helloFunction,
  parseScriptFunction,
  generateAssetVariationFunction,
  proposeStoryboardFunction,
  generateKeyframeFunction,
  generateVideoFunction,
  bindAssetElementFunction,
  generateMotionPromptsFunction,
  derivePairedFrameFunction,
];
