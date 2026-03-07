import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getApiKey } from "../integrations/llm/adapter.js";
import { createAnthropicProvider } from "../integrations/llm/anthropic.js";
import { createOllamaProvider } from "../integrations/llm/ollama.js";
import { createOpenAIProvider } from "../integrations/llm/openai.js";

// Save and restore env
let savedKey: string | undefined;

beforeEach(() => {
	savedKey = process.env.BACKLOG_DRIFT_API_KEY;
});

afterEach(() => {
	if (savedKey !== undefined) {
		process.env.BACKLOG_DRIFT_API_KEY = savedKey;
	} else {
		process.env.BACKLOG_DRIFT_API_KEY = undefined;
	}
	// Restore global fetch
	globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, status = 200) {
	globalThis.fetch = (async () => ({
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(response),
		json: async () => response,
	})) as unknown as typeof fetch;
}

describe("getApiKey", () => {
	test("returns key from env", () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key-123";
		expect(getApiKey()).toBe("test-key-123");
	});

	test("throws when no key set", () => {
		process.env.BACKLOG_DRIFT_API_KEY = undefined;
		expect(() => getApiKey()).toThrow("BACKLOG_DRIFT_API_KEY");
	});
});

describe("Anthropic provider", () => {
	test("sends correct request and parses response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		let capturedRequest: { url: string; init: RequestInit } | null = null;

		globalThis.fetch = (async (url: string, init: RequestInit) => {
			capturedRequest = { url, init };
			return {
				ok: true,
				json: async () => ({
					content: [{ type: "text", text: "Hello from Claude" }],
					usage: { input_tokens: 10, output_tokens: 5 },
				}),
			};
		}) as unknown as typeof fetch;

		const provider = createAnthropicProvider();
		const response = await provider.chat([{ role: "user", content: "test" }], "claude-sonnet-4-20250514");

		expect(capturedRequest?.url).toContain("anthropic.com");
		expect(response.content).toBe("Hello from Claude");
		expect(response.usage?.inputTokens).toBe(10);
		expect(response.usage?.outputTokens).toBe(5);

		const body = JSON.parse(capturedRequest?.init.body as string);
		expect(body.model).toBe("claude-sonnet-4-20250514");
		expect((capturedRequest?.init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
	});

	test("includes system message separately", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		let capturedBody: Record<string, unknown> = {};

		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			capturedBody = JSON.parse(init.body as string);
			return {
				ok: true,
				json: async () => ({
					content: [{ type: "text", text: "ok" }],
					usage: { input_tokens: 1, output_tokens: 1 },
				}),
			};
		}) as unknown as typeof fetch;

		const provider = createAnthropicProvider();
		await provider.chat(
			[
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "test" },
			],
			"test-model",
		);

		expect(capturedBody.system).toBe("You are helpful");
		expect((capturedBody.messages as Array<{ role: string }>).length).toBe(1);
		expect((capturedBody.messages as Array<{ role: string }>)[0].role).toBe("user");
	});

	test("throws on API error", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		mockFetch({ error: "bad request" }, 400);

		const provider = createAnthropicProvider();
		await expect(provider.chat([{ role: "user", content: "test" }], "model")).rejects.toThrow("Anthropic API error");
	});
});

describe("OpenAI provider", () => {
	test("sends correct request and parses response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		let capturedRequest: { url: string; init: RequestInit } | null = null;

		globalThis.fetch = (async (url: string, init: RequestInit) => {
			capturedRequest = { url, init };
			return {
				ok: true,
				json: async () => ({
					choices: [{ message: { content: "Hello from GPT" } }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				}),
			};
		}) as unknown as typeof fetch;

		const provider = createOpenAIProvider();
		const response = await provider.chat([{ role: "user", content: "test" }], "gpt-4o");

		expect(capturedRequest?.url).toContain("openai.com");
		expect(response.content).toBe("Hello from GPT");
		expect(response.usage?.inputTokens).toBe(10);
		expect(response.usage?.outputTokens).toBe(5);

		expect((capturedRequest?.init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
	});

	test("throws on API error", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		mockFetch({ error: "unauthorized" }, 401);

		const provider = createOpenAIProvider();
		await expect(provider.chat([{ role: "user", content: "test" }], "model")).rejects.toThrow("OpenAI API error");
	});
});

describe("Ollama provider", () => {
	test("sends correct request and parses response", async () => {
		let capturedRequest: { url: string; init: RequestInit } | null = null;

		globalThis.fetch = (async (url: string, init: RequestInit) => {
			capturedRequest = { url, init };
			return {
				ok: true,
				json: async () => ({
					message: { content: "Hello from Ollama" },
					eval_count: 100,
					prompt_eval_count: 50,
				}),
			};
		}) as unknown as typeof fetch;

		const provider = createOllamaProvider("http://localhost:11434");
		const response = await provider.chat([{ role: "user", content: "test" }], "llama3");

		expect(capturedRequest?.url).toContain("localhost:11434");
		expect(response.content).toBe("Hello from Ollama");
		expect(response.usage?.inputTokens).toBe(50);
		expect(response.usage?.outputTokens).toBe(100);

		const body = JSON.parse(capturedRequest?.init.body as string);
		expect(body.stream).toBe(false);
	});

	test("handles response without usage stats", async () => {
		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				message: { content: "no usage" },
			}),
		})) as unknown as typeof fetch;

		const provider = createOllamaProvider();
		const response = await provider.chat([{ role: "user", content: "test" }], "model");

		expect(response.content).toBe("no usage");
		expect(response.usage).toBeUndefined();
	});

	test("throws on API error", async () => {
		mockFetch({ error: "model not found" }, 404);

		const provider = createOllamaProvider();
		await expect(provider.chat([{ role: "user", content: "test" }], "model")).rejects.toThrow("Ollama API error");
	});
});
