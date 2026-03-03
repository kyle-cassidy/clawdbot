/**
 * Delta Classification Plugin for OpenClaw.
 *
 * Registers:
 * - Tools: search_clients, search_regulators, lookup_document_type, lookup_state,
 *          submit_classification
 * - HTTP handler: POST /delta/paperless-webhook (Paperless post-consume trigger)
 * - Hook: before_prompt_build (inject CBR similar-doc context)
 * - Hook: agent_end (publish classification results, trigger sync)
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createClassificationTools } from "./src/tools.js";
import { createPaperlessWebhookHandler } from "./src/webhook.js";
import { createClassificationHooks } from "./src/hooks.js";
import type { DeltaPluginConfig } from "./src/types.js";

const plugin = {
  id: "delta-classification",
  name: "Delta Document Classification",
  description: "AI-powered regulatory document classification with entity matching and automated filing",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig ?? {}) as DeltaPluginConfig;

    // Register classification tools (LLM-callable)
    for (const tool of createClassificationTools(config, api.logger)) {
      api.registerTool(tool);
    }

    // Register Paperless webhook HTTP handler
    api.registerHttpRoute({
      path: "/delta/paperless-webhook",
      handler: createPaperlessWebhookHandler(config, api),
    });

    // Register hooks for context enrichment and result handling
    const hooks = createClassificationHooks(config, api);
    api.on("before_prompt_build", hooks.injectSimilarDocContext);
    api.on("agent_end", hooks.handleClassificationResult);
  },
};

export default plugin;
