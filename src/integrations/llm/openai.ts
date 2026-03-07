import { type LLMMessage, type LLMProvider, type LLMResponse, getApiKey } from "./adapter.js";

export function createOpenAIProvider(): LLMProvider {
	return {
		name: "openai",
		async chat(messages: LLMMessage[], model: string): Promise<LLMResponse> {
			const apiKey = getApiKey();

			const response = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					max_tokens: 4096,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`OpenAI API error (${response.status}): ${error}`);
			}

			const data = (await response.json()) as {
				choices: Array<{ message: { content: string } }>;
				usage: { prompt_tokens: number; completion_tokens: number };
			};

			return {
				content: data.choices[0]?.message?.content ?? "",
				usage: {
					inputTokens: data.usage.prompt_tokens,
					outputTokens: data.usage.completion_tokens,
				},
			};
		},
	};
}
