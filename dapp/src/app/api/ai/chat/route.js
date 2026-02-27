import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const DEFAULT_MODELS = {
  claude: {
    id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    label: "Claude (Anthropic)",
  },
  llama: {
    id: "meta.llama3-1-70b-instruct-v1:0",
    label: "Llama (Meta)",
  },
  mistral: {
    id: "mistral.mistral-large-2407-v1:0",
    label: "Mistral",
  },
};

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
    const {
      messages,
      model: modelKey,
      marketContext,
      credentials,
    } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    // Credentials can come from request body or env vars
    const accessKeyId = credentials?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = credentials?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const region = credentials?.awsRegion || process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      return Response.json(
        {
          error: "AWS credentials not configured",
          hint: "Go to the AI Bot tab → Settings to add your AWS Access Key ID and Secret Access Key.",
        },
        { status: 401 }
      );
    }

    // Build model config — check for custom model IDs from credentials
    const modelPresets = { ...DEFAULT_MODELS };
    if (credentials?.claudeModelId) modelPresets.claude = { ...modelPresets.claude, id: credentials.claudeModelId };
    if (credentials?.llamaModelId) modelPresets.llama = { ...modelPresets.llama, id: credentials.llamaModelId };
    if (credentials?.mistralModelId) modelPresets.mistral = { ...modelPresets.mistral, id: credentials.mistralModelId };

    const preset = modelPresets[modelKey] || modelPresets.claude;

    // Create client per request with provided credentials
    const client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Build system prompt with live market data
    let systemText = SYSTEM_PROMPT;
    if (marketContext) {
      systemText += `\n\nCurrent WazirX Market Data (INR):\n${marketContext}`;
    }

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

    let hint;
    if (err.name === "AccessDeniedException" || err.name === "UnrecognizedClientException") {
      hint = "Invalid AWS credentials or you don't have access to this Bedrock model. Check your keys and enable model access in the AWS Bedrock console.";
    } else if (err.name === "ValidationException") {
      hint = "The selected model ID may be invalid or not available in your region. Try a different model or region.";
    }

    return Response.json(
      { error: "AI request failed", details: err.message, hint },
      { status: err.name === "AccessDeniedException" ? 403 : 500 }
    );
  }
}

// Expose available models
export async function GET() {
  const models = Object.entries(DEFAULT_MODELS).map(([key, val]) => ({
    key,
    id: val.id,
    label: val.label,
  }));
  return Response.json({ models });
}
