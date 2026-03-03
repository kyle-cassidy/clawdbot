/**
 * Paperless webhook handler.
 *
 * Receives POST /delta/paperless-webhook from Paperless-ngx's post-consume
 * script and routes the document to the classifier agent session.
 *
 * Paperless post-consume script should call:
 *   curl -X POST http://gateway:18789/delta/paperless-webhook \
 *     -H "Content-Type: application/json" \
 *     -d '{"document_id": $DOCUMENT_ID, "task_id": "$TASK_ID"}'
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { DeltaPluginConfig } from "./types.js";
import { DeltaApiClient } from "./delta-api.js";

export function createPaperlessWebhookHandler(
  config: DeltaPluginConfig,
  api: OpenClawPluginApi,
) {
  const deltaApi = new DeltaApiClient(config);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Only accept POST
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Parse body
    let body: { document_id?: number; task_id?: string };
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const documentId = body.document_id;
    if (typeof documentId !== "number") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "document_id (number) is required" }));
      return;
    }

    api.logger.info(`Paperless webhook: document_id=${documentId}`);

    // Respond immediately — classification runs asynchronously
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accepted: true, document_id: documentId }));

    // If auto-classify is disabled, just acknowledge
    if (config.autoClassifyOnWebhook === false) {
      api.logger.info(`Auto-classify disabled, skipping doc ${documentId}`);
      return;
    }

    // Fetch document content from Delta API
    try {
      const doc = await deltaApi.getDocumentContent(documentId);

      // Build the classification prompt
      const prompt = buildClassificationPrompt(documentId, doc.text, doc.metadata);

      // Route to the classifier agent session via gateway
      // The agent will use the registered tools to classify the document
      api.logger.info(`Dispatching classification for doc ${documentId} to agent:classifier`);

      // Emit a gateway event that triggers the agent session
      // This uses OpenClaw's internal session dispatch mechanism
      api.emit?.("delta:classify", {
        documentId,
        prompt,
        sessionKey: "agent:classifier:main",
      });
    } catch (err) {
      api.logger.warn(
        `Failed to fetch/dispatch doc ${documentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}

function buildClassificationPrompt(
  documentId: number,
  text: string,
  metadata: Record<string, unknown>,
): string {
  const metaLines = Object.entries(metadata)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join("\n");

  return [
    `Classify document #${documentId}.`,
    "",
    "## Document Metadata",
    metaLines || "  (none available)",
    "",
    "## Document Text",
    text.slice(0, 8000), // Limit to ~8k chars for context window
    text.length > 8000 ? `\n... [truncated, ${text.length} total characters]` : "",
    "",
    "Use the available tools to identify the client, document type, regulator, and any relevant dates or reference numbers.",
    "When you're confident in your classification, call submit_classification with your results.",
  ].join("\n");
}
