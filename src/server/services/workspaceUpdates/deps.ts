import { getPublicBaseUrlFromEnv } from "~/lib/urls";

import type { GenerateDeps } from "./generate";
import { templateWriter } from "./writer";

/** Production wiring for generation: shared by the router and the cron. */
export function defaultGenerateDeps(): GenerateDeps {
  return {
    writer: templateWriter,
    notify: () => Promise.resolve(),
    baseUrl: getPublicBaseUrlFromEnv(),
  };
}
