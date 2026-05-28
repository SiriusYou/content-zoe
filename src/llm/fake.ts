import { LLMProviderError } from "./provider.ts";
import type { LLMProvider } from "./provider.ts";

export class FakeProvider implements LLMProvider {
  readonly name = "fake";

  constructor(private readonly responses: Map<string, string>) {}

  async runPrompt(
    prompt: string,
    _cwd: string,
    _timeoutMs: number,
  ): Promise<string> {
    const response = this.responses.get(prompt);
    if (response === undefined) {
      throw new LLMProviderError({
        kind: "parse",
        message: `fake provider has no canned response for prompt: ${prompt}`,
      });
    }
    return response;
  }
}
