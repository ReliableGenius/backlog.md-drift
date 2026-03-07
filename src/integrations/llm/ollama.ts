import type { LLMMessage, LLMProvider, LLMResponse } from "./adapter.js";

export function createOllamaProvider(baseUrl = "http://localhost:11434"): LLMProvider {
	return {
		name: "ollama",
		async chat(messages: LLMMessage[], model: string): Promise<LLMResponse> {
			const response = await fetch(`${baseUrl}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model,
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					stream: false,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Ollama API error (${response.status}): ${error}`);
			}

			const data = (await response.json()) as {
				message: { content: string };
				eval_count?: number;
				prompt_eval_count?: number;
			};

			return {
				content: data.message.content,
				usage: data.eval_count
					? {
							inputTokens: data.prompt_eval_count ?? 0,
							outputTokens: data.eval_count,
						}
					: undefined,
			};
		},
	};
}
