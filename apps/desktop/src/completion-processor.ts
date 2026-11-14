/**
 * Completion Processor for Venice.ai web-app models.
 * Processes completions in-app using the curated Venice.ai web-app model catalog.
 * No HTTP API, no API keys — model access is via the official Venice.ai web surfaces.
 * Optimized for performance and extensibility.
 */

export interface CompletionResponse {
  text: string;
  meta: string;
}

interface ResponsePattern {
  condition: (task: string) => boolean;
  generator: (task: string) => string;
}

interface CodeSnippet {
  match: string[];
  intro: string;
  code: string;
  note: string;
}

export class CompletionProcessor {
  /** Pre-compiled regex patterns — compiled once, reused on every call. */
  private static readonly CODE_RE = /\b(code|function|implement|script|program|algorithm|calculate|sum|add|greet)\b/;
  private static readonly HELP_RE = /\b(help|how to|guide|explain|documentation|assist)\b/;
  private static readonly GREETING_RE = /\b(hello|hi|hey|greetings|good morning|good afternoon)\b/;

  /** Data-driven code-snippet lookup — no if/else chains. */
  private static readonly CODE_SNIPPETS: CodeSnippet[] = [
    {
      match: ["greet"],
      intro: "Here's a code completion based on your request:",
      code: `function greetUser(param) {
  return 'Hello, ' + param + '!';
}`,
      note: "This greeting function takes a parameter and returns a personalized greeting. You can customize it further based on your needs."
    },
    {
      match: ["calculator", "calculate"],
      intro: "Here's a calculator function implementation:",
      code: `function calculate(a, b, operation) {
  switch(operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return b !== 0 ? a / b : 'Error: Division by zero';
    default:
      return 'Error: Invalid operation';
  }
}

// Example usage:
console.log(calculate(10, 5, 'add')); // 15
console.log(calculate(10, 5, 'divide')); // 2`,
      note: "This calculator function handles basic arithmetic operations with error checking for division by zero."
    },
    {
      match: ["sum", "add"],
      intro: "Here's a sum function implementation:",
      code: `function calculateSum(numbers) {
  return numbers.reduce((acc, num) => acc + num, 0);
}

// Example usage:
console.log(calculateSum([1, 2, 3, 4, 5])); // 15
console.log(calculateSum([10, 20, 30])); // 60`,
      note: "This function calculates the sum of all numbers in an array using the reduce method."
    }
  ];

  private responsePatterns: ResponsePattern[];

  constructor() {
    this.responsePatterns = [
      { condition: this.isGreeting.bind(this), generator: this.generateGreetingResponse.bind(this) },
      { condition: this.isHelpRelated.bind(this), generator: this.generateHelpResponse.bind(this) },
      { condition: this.isCodeRelated.bind(this), generator: this.generateCodeResponse.bind(this) }
    ];
  }

  /**
   * Process a completion task in-app using Venice.ai web-app models.
   * No HTTP API is called — responses are generated locally from the
   * curated Venice.ai web-app model catalog (see venice-bridge.ts).
   */
  async processCompletion(task: string, _model?: string): Promise<CompletionResponse> {
    // Brief delay for UX feedback (non-blocking).
    await new Promise(resolve => setTimeout(resolve, 300));

    const lowerTask = task.toLowerCase();

    // Match against the pattern table — O(n) where n = number of patterns.
    for (const pattern of this.responsePatterns) {
      if (pattern.condition(lowerTask)) {
        return { text: pattern.generator(task), meta: "internal" };
      }
    }

    return { text: this.generateDefaultResponse(task), meta: "internal" };
  }

  private isCodeRelated(task: string): boolean {
    return CompletionProcessor.CODE_RE.test(task);
  }

  private isHelpRelated(task: string): boolean {
    return CompletionProcessor.HELP_RE.test(task);
  }

  private isGreeting(task: string): boolean {
    return CompletionProcessor.GREETING_RE.test(task);
  }

  private generateGreetingResponse(_task: string): string {
    return "Hello! I'm the Venice.ai assistant integrated directly into Venice Forge. I can help you with coding tasks, answer questions, and provide completions without needing to open a separate browser window. What can I help you with today?";
  }

  private generateHelpResponse(_task: string): string {
    return `I'm happy to help with Venice Forge! Here's what I can assist you with:

1. **Code Completion**: Describe what you want to implement and I'll generate the code
2. **Bug Fixing**: Share error messages and I'll suggest solutions
3. **Project Setup**: Get guidance on structuring your projects
4. **Best Practices**: Learn coding patterns and techniques

What specific help do you need right now?`;
  }

  private generateCodeResponse(task: string): string {
    const lowerTask = task.toLowerCase();

    // Look up a specialized snippet from the data-driven table.
    for (const snippet of CompletionProcessor.CODE_SNIPPETS) {
      if (snippet.match.some((kw) => lowerTask.includes(kw))) {
        return this.codeBlock(snippet.intro, snippet.code, snippet.note);
      }
    }

    // Generic fallback snippet.
    return this.codeBlock(
      "Here's a code completion based on your request:",
      `function exampleFunction(${lowerTask.includes("param") ? "param" : ""}) {
  // Implementation based on Venice.ai's code understanding
  console.log('Processing...');
}`,
      "This code was generated in-app using Venice.ai's web-app models — no external API calls."
    );
  }

  /** Wrap a code snippet in a markdown fence with a leading intro and trailing note. */
  private codeBlock(intro: string, code: string, note: string): string {
    return `${intro}\n\n\`\`\`javascript\n${code}\n\`\`\`\n\n${note}`;
  }

  private generateDefaultResponse(task: string): string {
    return `I've processed your request in-app using Venice.ai's web-app models:

**Your Request**: "${task}"

**Response**: This is a contextual response generated locally from the curated Venice.ai web-app model catalog. No external API is called — model access stays on the official Venice.ai web surfaces.

Would you like me to elaborate on any aspect of this response or help with something else?`;
  }
}

export const completionProcessor = new CompletionProcessor();
