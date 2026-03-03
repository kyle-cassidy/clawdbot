/**
 * Classification hooks — cross-cutting behaviors injected into the agent lifecycle.
 *
 * before_prompt_build: Inject similar-document context from CBR before the agent
 *   starts reasoning. This gives the agent historical examples to learn from.
 *
 * agent_end: After classification completes, handle the result — auto-file if
 *   high confidence, or send notification if review is needed.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { DeltaPluginConfig } from "./types.js";
import { DeltaApiClient } from "./delta-api.js";

export function createClassificationHooks(config: DeltaPluginConfig, api: OpenClawPluginApi) {
  const deltaApi = new DeltaApiClient(config);

  return {
    /**
     * Inject similar-document context before the agent starts.
     *
     * When a classification session starts, we search the CBR knowledge base
     * for similar documents and prepend their classification results as context.
     * This is the "reactive context loading" pattern from Delta's agentic core,
     * re-implemented as an OpenClaw hook.
     */
    async injectSimilarDocContext(params: {
      sessionKey?: string;
      prompt?: string;
    }): Promise<{ prependContext?: string } | void> {
      // Only inject for classifier agent sessions
      if (!params.sessionKey?.startsWith("agent:classifier")) {
        return;
      }

      // Extract document text from prompt (if present)
      const textMatch = params.prompt?.match(/## Document Text\n([\s\S]*?)(?:\n##|\n\.\.\.|$)/);
      if (!textMatch?.[1]) {
        return;
      }

      const documentText = textMatch[1].trim().slice(0, 2000); // Use first 2k for similarity

      try {
        const similar = await deltaApi.searchSimilarDocuments(documentText, 3);
        if (similar.length === 0) {
          return;
        }

        const context = [
          "## Similar Past Classifications (from knowledge base)",
          "",
          ...similar.map(
            (doc, i) =>
              `${i + 1}. Document #${doc.document_id} (${(doc.similarity * 100).toFixed(0)}% similar)\n` +
              `   Client: ${doc.classification.client}\n` +
              `   Type: ${doc.classification.document_type}\n` +
              (doc.classification.regulator ? `   Regulator: ${doc.classification.regulator}\n` : "") +
              `   Preview: "${doc.text_preview.slice(0, 100)}..."`,
          ),
          "",
          "Use these as reference, but classify based on the actual document content.",
          "",
        ].join("\n");

        api.logger.info(`Injected ${similar.length} similar-doc contexts for classifier session`);
        return { prependContext: context };
      } catch (err) {
        api.logger.warn(
          `CBR lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Non-fatal — classification proceeds without CBR context
        return;
      }
    },

    /**
     * Handle classification results after the agent finishes.
     *
     * Checks whether the agent called submit_classification and whether
     * the result needs human review. Sends notifications via the configured
     * channel (Google Chat, Slack, etc.).
     */
    async handleClassificationResult(params: {
      sessionKey?: string;
      toolCalls?: Array<{ name: string; result?: unknown }>;
    }): Promise<void> {
      if (!params.sessionKey?.startsWith("agent:classifier")) {
        return;
      }

      // Find the submit_classification tool call
      const submitCall = params.toolCalls?.find((tc) => tc.name === "submit_classification");
      if (!submitCall?.result) {
        api.logger.warn("Classifier agent completed without calling submit_classification");
        return;
      }

      const result = submitCall.result as { submitted?: boolean; needsReview?: boolean; submission?: Record<string, unknown> };
      const submission = result.submission as Record<string, unknown> | undefined;

      if (!submission) {
        return;
      }

      const docId = submission.document_id as number;
      const confidence = submission.confidence as number;
      const clientCode = (submission.client as Record<string, unknown>)?.code as string;
      const docType = (submission.document_type as Record<string, unknown>)?.value as string;

      if (result.needsReview) {
        api.logger.info(
          `Doc #${docId} needs review (confidence=${confidence}). Notifying channel.`,
        );

        // Send notification to configured channel
        if (config.notifyChannel) {
          const message =
            `Review needed: Document #${docId}\n` +
            `Classification: ${clientCode} / ${docType} (confidence: ${(confidence * 100).toFixed(0)}%)\n` +
            `Please review and approve or correct.`;

          // Use OpenClaw's channel messaging to send the notification
          api.emit?.("delta:review_needed", {
            documentId: docId,
            channel: config.notifyChannel,
            message,
          });
        }
      } else {
        api.logger.info(
          `Doc #${docId} auto-classified: ${clientCode}/${docType} (confidence=${confidence})`,
        );
      }
    },
  };
}
