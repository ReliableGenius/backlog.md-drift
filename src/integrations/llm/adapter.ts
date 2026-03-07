export interface LLMMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface LLMResponse {
	content: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
}

export interface LLMProvider {
	name: string;
	chat(messages: LLMMessage[], model: string): Promise<LLMResponse>;
}

export function getApiKey(): string {
	const key = process.env.BACKLOG_DRIFT_API_KEY;
	if (!key) {
		throw new Error("BACKLOG_DRIFT_API_KEY environment variable is required for semantic checks");
	}
	return key;
}
