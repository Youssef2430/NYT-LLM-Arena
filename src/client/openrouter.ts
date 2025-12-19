import pino from "pino";

// ========================================
// Types
// ========================================

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  defaultTopP?: number;
  includeUsage?: boolean;
  referer?: string;
  title?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number | null;
}

export interface ChatCompletionResult {
  id: string;
  model: string;
  content: string;
  finishReason: string;
  usage: OpenRouterUsage | null;
  latencyMs: number;
  raw: ChatCompletionResponse;
}

// ========================================
// OpenRouter Client
// ========================================

const logger = pino({ name: "openrouter-client" });

export class OpenRouterClient {
  private config: Required<
    Pick<OpenRouterConfig, "apiKey" | "baseUrl" | "includeUsage">
  > &
    OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.config = {
      baseUrl: "https://openrouter.ai/api/v1",
      includeUsage: true,
      ...config,
    };
  }

  /**
   * Make a chat completion request with structured output
   */
  async chatCompletion(
    request: ChatCompletionRequest,
    options: {
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<ChatCompletionResult> {
    const startTime = performance.now();

    const { timeoutMs = 60000, signal } = options;

    // Create timeout abort controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine signals if external signal provided
    const combinedSignal = signal
      ? this.combineAbortSignals(signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.defaultTemperature ?? 0,
        max_tokens: request.max_tokens ?? this.config.defaultMaxTokens ?? 1024,
        stream: false,
      };

      if (
        request.top_p !== undefined ||
        this.config.defaultTopP !== undefined
      ) {
        body.top_p = request.top_p ?? this.config.defaultTopP;
      }

      if (request.response_format) {
        body.response_format = request.response_format;
      }

      // Include usage tracking if enabled
      if (this.config.includeUsage) {
        body.usage = { include: true };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      };

      if (this.config.referer) {
        headers["HTTP-Referer"] = this.config.referer;
      }

      if (this.config.title) {
        headers["X-Title"] = this.config.title;
      }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = `OpenRouter API error: ${errorJson.error.message}`;
          }
        } catch {
          // Use original error message
        }

        throw new OpenRouterError(errorMessage, response.status, errorText);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const latencyMs = performance.now() - startTime;

      // Extract usage info
      let usage: OpenRouterUsage | null = null;
      if (data.usage) {
        usage = {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          cost: data.usage.cost ?? null,
        };
      }

      const choice = data.choices[0];
      if (!choice) {
        throw new OpenRouterError("No choices returned from OpenRouter", 0);
      }

      return {
        id: data.id,
        model: data.model,
        content: choice.message.content,
        finishReason: choice.finish_reason,
        usage,
        latencyMs,
        raw: data,
      };
    } catch (error) {
      if (error instanceof OpenRouterError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new OpenRouterError(
            `Request timed out after ${timeoutMs}ms`,
            408,
          );
        }
        throw new OpenRouterError(error.message, 0);
      }

      throw new OpenRouterError("Unknown error occurred", 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make a chat completion request with structured JSON output
   */
  async chatCompletionWithSchema<T>(
    request: Omit<ChatCompletionRequest, "response_format"> & {
      jsonSchema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
    },
    options: {
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<ChatCompletionResult & { parsed: T | null }> {
    const result = await this.chatCompletion(
      {
        ...request,
        response_format: {
          type: "json_schema",
          json_schema: request.jsonSchema,
        },
      },
      options,
    );

    // Try to parse the JSON response
    let parsed: T | null = null;
    try {
      parsed = JSON.parse(result.content) as T;
    } catch (error) {
      logger.warn(
        { content: result.content, error },
        "Failed to parse JSON response",
      );
    }

    return {
      ...result,
      parsed,
    };
  }

  /**
   * Check if an error is retryable
   */
  static isRetryableError(error: unknown): boolean {
    if (error instanceof OpenRouterError) {
      // Retry on rate limit, server errors, or timeouts
      return (
        error.statusCode === 429 ||
        error.statusCode === 408 ||
        (error.statusCode >= 500 && error.statusCode < 600)
      );
    }
    return false;
  }

  /**
   * Retry a request with exponential backoff
   */
  async chatCompletionWithRetry(
    request: ChatCompletionRequest,
    options: {
      timeoutMs?: number;
      signal?: AbortSignal;
      maxRetries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    } = {},
  ): Promise<ChatCompletionResult> {
    const {
      maxRetries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      ...requestOptions
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.chatCompletion(request, requestOptions);
      } catch (error) {
        lastError = error as Error;

        if (
          !OpenRouterClient.isRetryableError(error) ||
          attempt === maxRetries
        ) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs,
        );

        logger.info(
          { attempt: attempt + 1, maxRetries, delayMs: delay },
          "Retrying OpenRouter request",
        );

        await this.sleep(delay);
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Get available models from OpenRouter
   */
  async getModels(): Promise<
    Array<{
      id: string;
      name: string;
      context_length: number;
      pricing: {
        prompt: string;
        completion: string;
      };
    }>
  > {
    const response = await fetch(`${this.config.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new OpenRouterError(
        `Failed to fetch models: ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        context_length: number;
        pricing: {
          prompt: string;
          completion: string;
        };
      }>;
    };
    return data.data;
  }

  /**
   * Combine multiple abort signals
   */
  private combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }

      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    return controller.signal;
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ========================================
// Error Class
// ========================================

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

// ========================================
// Factory function
// ========================================

export function createOpenRouterClient(
  config?: Partial<OpenRouterConfig>,
): OpenRouterClient {
  const apiKey = config?.apiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey in config.",
    );
  }

  return new OpenRouterClient({
    apiKey,
    referer: "https://github.com/nyt-arena",
    title: "NYT Arena Benchmark",
    ...config,
  });
}
