import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Model presets — users configure via env or pick from UI
const MODEL_PRESETS = {
  claude: {
    id: process.env.BEDROCK_CLAUDE_MODEL_ID || "anthropic.claude-3-5-sonnet-20241022-v2:0",
    label: "Claude (Anthropic)",
  },
  llama: {
    id: process.env.BEDROCK_LLAMA_MODEL_ID || "meta.llama3-1-70b-instruct-v1:0",
    label: "Llama (Meta)",
  },
  mistral: {
    id: process.env.BEDROCK_MISTRAL_MODEL_ID || "mistral.mistral-large-2407-v1:0",
    label: "Mistral",
  },
};

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined, // falls back to default credential chain
});

const SYSTEM_PROMPT = `You are CryptoDash AI, a crypto market analyst assistant embedded in a trading dashboard.
You have access to real-time WazirX market data provided as context.

Your capabilities:
- Analyze price trends, support/resistance levels, and momentum
- Provide technical analysis insights based on the data
- Explain market movements and correlations
- Give educational context about trading strategies
- Summarize portfolio performance

Rules:
- Always clarify that your analysis is NOT financial advice
- Be concise and data-driven — reference the actual numbers provided
- Use bullet points and clear formatting
- If asked about a token not in the data, say so
- When giving predictions, clearly state confidence levels and risks`;

export async function POST(request) {
  try {
    const { messages, model: modelKey, marketContext } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    const preset = MODEL_PRESETS[modelKey] || MODEL_PRESETS.claude;

    // Build system prompt with live market data
    let systemText = SYSTEM_PROMPT;
    if (marketContext) {
      systemText += `\n\nCurrent WazirX Market Data (INR):\n${marketContext}`;
    }

    // Convert messages to Bedrock Converse format
    const converseMessages = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: [{ text: m.content }],
    }));

    const command = new ConverseCommand({
      modelId: preset.id,
      system: [{ text: systemText }],
      messages: converseMessages,
      inferenceConfig: {
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const response = await client.send(command);

    const outputText =
      response.output?.message?.content?.[0]?.text || "No response generated.";

    return Response.json({
      response: outputText,
      model: preset.label,
      usage: response.usage,
    });
  } catch (err) {
    console.error("Bedrock API error:", err);

    const status = err.name === "AccessDeniedException" ? 403 : 500;
    return Response.json(
      {
        error: "AI request failed",
        details: err.message,
        hint:
          status === 403
            ? "Check your AWS credentials and Bedrock model access in the AWS console."
            : undefined,
      },
      { status }
    );
  }
}

// Expose available models
export async function GET() {
  const models = Object.entries(MODEL_PRESETS).map(([key, val]) => ({
    key,
    id: val.id,
    label: val.label,
  }));
  return Response.json({ models });
}
