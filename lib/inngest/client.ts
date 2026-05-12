import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "cinematic-creator",
  // EVENT_KEY and SIGNING_KEY are read from env automatically by Inngest in production.
});
