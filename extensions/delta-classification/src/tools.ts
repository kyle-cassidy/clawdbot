/**
 * Classification tools — LLM-callable functions for document classification.
 *
 * These are the same 6 tools from the Python classification module,
 * re-exposed as OpenClaw agent tools. Each tool calls the Delta Python
 * API via HTTP — the domain logic stays in Python.
 */
import { Type } from "@sinclair/typebox";
import type { DeltaPluginConfig } from "./types.js";
import { DeltaApiClient } from "./delta-api.js";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

export function createClassificationTools(config: DeltaPluginConfig, logger: Logger) {
  const api = new DeltaApiClient(config);

  const searchClients = {
    name: "search_clients",
    label: "Search Clients",
    description:
      "Fuzzy-match a client name against the Delta reference database. " +
      "Use this when you find a company name in a document and need to identify which client it belongs to. " +
      "Returns ranked matches with codes, names, and confidence scores.",
    parameters: Type.Object({
      query: Type.String({
        description: "The client name or partial name to search for (e.g., 'Precision Lab', 'PLL')",
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max results to return (default: 5)", minimum: 1, maximum: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const limit = (params.limit as number) ?? 5;
      logger.info(`search_clients: "${query}" (limit=${limit})`);

      const result = await api.searchClients(query, limit);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: { matchCount: result.matches.length },
      };
    },
  };

  const searchRegulators = {
    name: "search_regulators",
    label: "Search Regulators",
    description:
      "Search for a regulatory agency by name or keyword. " +
      "Returns matching regulators with their state codes. " +
      "Use when you find a regulatory body name in a document.",
    parameters: Type.Object({
      query: Type.String({
        description: "Regulator name or keyword (e.g., 'NCDA', 'North Carolina Dept of Agriculture')",
      }),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 5)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const limit = (params.limit as number) ?? 5;
      logger.info(`search_regulators: "${query}"`);

      const result = await api.searchRegulators(query, limit);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };

  const lookupDocumentType = {
    name: "lookup_document_type",
    label: "Lookup Document Type",
    description:
      "Look up a document type by name or keyword. " +
      "Returns matching document types with their categories and extraction schemas. " +
      "Use to identify what kind of regulatory document you're classifying.",
    parameters: Type.Object({
      query: Type.String({
        description: "Document type to look up (e.g., 'certificate', 'registration', 'letter')",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      logger.info(`lookup_document_type: "${query}"`);

      const result = await api.lookupDocumentType(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };

  const listDocumentTypes = {
    name: "list_document_types",
    label: "List Document Types",
    description:
      "List all known document types in the system. " +
      "Use when you need to see the full taxonomy of document types.",
    parameters: Type.Object({}),
    async execute() {
      logger.info("list_document_types");
      const result = await api.listDocumentTypes();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };

  const lookupState = {
    name: "lookup_state",
    label: "Lookup State",
    description:
      "Look up a US state by code or name. Returns the state details and associated regulator. " +
      "Use when you find a state reference in a document.",
    parameters: Type.Object({
      code: Type.String({
        description: "Two-letter state code (e.g., 'NC', 'CA', 'TX')",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const code = params.code as string;
      logger.info(`lookup_state: "${code}"`);

      const result = await api.lookupState(code);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };

  const submitClassification = {
    name: "submit_classification",
    label: "Submit Classification",
    description:
      "Submit the final classification result for a document. " +
      "Call this AFTER you have identified the client, document type, and any regulators. " +
      "Include your confidence score — documents below the review threshold will be flagged for human review.",
    parameters: Type.Object({
      document_id: Type.Number({ description: "The Paperless document ID" }),
      confidence: Type.Number({
        description: "Overall classification confidence (0.0–1.0)",
        minimum: 0,
        maximum: 1,
      }),
      client_code: Type.String({ description: "Matched client code" }),
      client_name: Type.String({ description: "Matched client name" }),
      client_confidence: Type.Number({ description: "Client match confidence (0.0–1.0)" }),
      document_type: Type.String({ description: "Document type (e.g., 'Certificate', 'Application')" }),
      document_type_confidence: Type.Number({ description: "Document type confidence (0.0–1.0)" }),
      regulator_name: Type.Optional(Type.String({ description: "Regulator name if identified" })),
      regulator_state: Type.Optional(Type.String({ description: "Regulator state code (e.g., 'NC')" })),
      regulator_confidence: Type.Optional(Type.Number({ description: "Regulator confidence (0.0–1.0)" })),
      products: Type.Optional(Type.Array(Type.String(), { description: "Product names found" })),
      dates: Type.Optional(
        Type.Record(Type.String(), Type.String(), { description: "Named dates (e.g., approval_date)" }),
      ),
      reference_numbers: Type.Optional(
        Type.Array(Type.String(), { description: "Reference/certificate numbers found" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const p = params as Record<string, unknown>;

      const submission = {
        document_id: p.document_id as number,
        confidence: p.confidence as number,
        client: {
          value: p.client_name as string,
          code: p.client_code as string,
          confidence: p.client_confidence as number,
        },
        document_type: {
          value: p.document_type as string,
          confidence: p.document_type_confidence as number,
        },
        ...(p.regulator_name
          ? {
              regulator: {
                value: p.regulator_name as string,
                state_code: (p.regulator_state as string) ?? "",
                confidence: (p.regulator_confidence as number) ?? 0,
              },
            }
          : {}),
        products: (p.products as string[]) ?? [],
        dates: (p.dates as Record<string, string>) ?? {},
        reference_numbers: (p.reference_numbers as string[]) ?? [],
      };

      logger.info(
        `submit_classification: doc=${submission.document_id} client=${submission.client.code} ` +
          `type=${submission.document_type.value} confidence=${submission.confidence}`,
      );

      const result = await api.submitClassification(submission);
      const threshold = config.reviewThreshold ?? 0.9;
      const needsReview = submission.confidence < threshold;

      return {
        content: [
          {
            type: "text" as const,
            text: needsReview
              ? `Classification submitted for review (confidence ${submission.confidence} < threshold ${threshold}). ` +
                `A human reviewer will be notified.`
              : `Classification accepted (confidence ${submission.confidence}). Document will be filed automatically.`,
          },
        ],
        details: { submitted: result.ok, needsReview, submission },
      };
    },
  };

  return [searchClients, searchRegulators, lookupDocumentType, listDocumentTypes, lookupState, submitClassification];
}
