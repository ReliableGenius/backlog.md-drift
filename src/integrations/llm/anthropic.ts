import { type LLMMessage, type LLMProvider, type LLMResponse, getApiKey } from "./adapter.js";

export function createAnthropicProvider(): LLMProvider {
	return {
		name: "anthropic",
		async chat(messages: LLMMessage[], model: string): Promise<LLMResponse> {
			const apiKey = getApiKey();
			const systemMessage = messages.find((m) => m.role === "system");
			const nonSystemMessages = messages.filter((m) => m.role !== "system");

			const body: Record<string, unknown> = {
				model,
				max_tokens: 4096,
				messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
			};

			if (systemMessage) {
				body.system = systemMessage.content;
			}

			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Anthropic API error (${response.status}): ${error}`);
			}

			const data = (await response.json()) as {
				content: Array<{ type: string; text: string }>;
				usage: { input_tokens: number; output_tokens: number };
			};

			return {
				content: data.content
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join(""),
				usage: {
					inputTokens: data.usage.input_tokens,
					outputTokens: data.usage.output_tokens,
				},
			};
		},
	};
}
