/**
 * Delta Platform API client.
 *
 * Thin HTTP client that calls the Python backend services.
 * All domain logic lives in Python — this is just the bridge.
 */
import type {
  ClientSearchResult,
  ClassificationSubmission,
  DeltaPluginConfig,
  DocumentTypeResult,
  RegulatorSearchResult,
  SimilarDocument,
  StateResult,
} from "./types.js";

const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 10_000;

export class DeltaApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(config: DeltaPluginConfig) {
    this.baseUrl = (config.deltaApiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.token = config.deltaApiToken;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };

    const res = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Delta API ${res.status} ${res.statusText}: ${text}`);
    }

    return (await res.json()) as T;
  }

  // ─── Classification Tools ─────────────────────────────────────

  async searchClients(query: string, limit = 5): Promise<ClientSearchResult> {
    return this.fetch<ClientSearchResult>(
      `/api/reference/clients/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  async searchRegulators(query: string, limit = 5): Promise<RegulatorSearchResult> {
    return this.fetch<RegulatorSearchResult>(
      `/api/reference/regulators/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  async lookupDocumentType(query: string): Promise<DocumentTypeResult[]> {
    return this.fetch<DocumentTypeResult[]>(
      `/api/reference/document-types?q=${encodeURIComponent(query)}`,
    );
  }

  async listDocumentTypes(): Promise<DocumentTypeResult[]> {
    return this.fetch<DocumentTypeResult[]>("/api/reference/document-types");
  }

  async lookupState(code: string): Promise<StateResult> {
    return this.fetch<StateResult>(`/api/reference/states/${encodeURIComponent(code)}`);
  }

  // ─── Classification Results ───────────────────────────────────

  async submitClassification(submission: ClassificationSubmission): Promise<{ ok: boolean }> {
    return this.fetch<{ ok: boolean }>("/api/classification/submit", {
      method: "POST",
      body: JSON.stringify(submission),
    });
  }

  // ─── Knowledge Base (CBR) ────────────────────────────────────

  async searchSimilarDocuments(text: string, limit = 3): Promise<SimilarDocument[]> {
    return this.fetch<SimilarDocument[]>("/api/knowledge/similar", {
      method: "POST",
      body: JSON.stringify({ text, limit }),
    });
  }

  // ─── Document Fetching ────────────────────────────────────────

  async getDocumentContent(documentId: number): Promise<{ text: string; metadata: Record<string, unknown> }> {
    return this.fetch<{ text: string; metadata: Record<string, unknown> }>(
      `/api/documents/${documentId}/content`,
    );
  }
}
