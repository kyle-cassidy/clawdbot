/**
 * Shared types for the Delta Classification plugin.
 */

export type DeltaPluginConfig = {
  /** URL of the Delta Platform Python API */
  deltaApiUrl?: string;
  /** Auth token for the Delta Platform API */
  deltaApiToken?: string;
  /** Auto-classify when Paperless webhook fires */
  autoClassifyOnWebhook?: boolean;
  /** Confidence threshold for human review (default: 0.90) */
  reviewThreshold?: number;
  /** Default model for classification */
  defaultModel?: string;
  /** Channel to send notifications */
  notifyChannel?: string;
};

/** Response shape from Delta's /search-clients endpoint */
export type ClientSearchResult = {
  matches: Array<{
    code: string;
    name: string;
    score: number;
    aliases?: string[];
  }>;
};

/** Response shape from Delta's /search-regulators endpoint */
export type RegulatorSearchResult = {
  matches: Array<{
    name: string;
    state_code: string;
    score: number;
  }>;
};

/** Document type lookup result */
export type DocumentTypeResult = {
  id: string;
  name: string;
  category: string;
  extraction_schema?: string;
};

/** State lookup result */
export type StateResult = {
  code: string;
  name: string;
  regulator_name?: string;
};

/** Classification result submitted by the agent */
export type ClassificationSubmission = {
  document_id: number;
  confidence: number;
  client: { value: string; code: string; confidence: number };
  document_type: { value: string; confidence: number };
  regulator?: { value: string; state_code: string; confidence: number };
  products?: string[];
  dates?: Record<string, string>;
  reference_numbers?: string[];
};

/** Similar document from CBR search */
export type SimilarDocument = {
  document_id: number;
  similarity: number;
  classification: {
    client: string;
    document_type: string;
    regulator?: string;
  };
  text_preview: string;
};
