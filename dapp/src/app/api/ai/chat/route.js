import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Built-in Bedrock model presets
const DEFAULT_MODELS = {
  "claude-sonnet": {
    id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
  },
  "claude-haiku": {
    id: "anthropic.claude-3-5-haiku-20241022-v1:0",
    label: "Claude 3.5 Haiku",
    provider: "Anthropic",
  },
  "llama3-70b": {
    id: "meta.llama3-1-70b-instruct-v1:0",
    label: "Llama 3.1 70B",
    provider: "Meta",
  },
  "llama3-8b": {
    id: "meta.llama3-1-8b-instruct-v1:0",
    label: "Llama 3.1 8B",
    provider: "Meta",
  },
  "mistral-large": {
    id: "mistral.mistral-large-2407-v1:0",
    label: "Mistral Large",
    provider: "Mistral",
  },
  "nova-pro": {
    id: "amazon.nova-pro-v1:0",
    label: "Amazon Nova Pro",
    provider: "Amazon",
  },
  "nova-lite": {
    id: "amazon.nova-lite-v1:0",
    label: "Amazon Nova Lite",
    provider: "Amazon",
  },
  "cohere-command": {
    id: "cohere.command-r-plus-v1:0",
    label: "Cohere Command R+",
    provider: "Cohere",
  },
  "jamba-large": {
    id: "ai21.jamba-1-5-large-v1:0",
    label: "AI21 Jamba 1.5 Large",
    provider: "AI21",
  },
  "deepseek-r1": {
    id: "deepseek.deepseek-r1-v1:0",
    label: "DeepSeek R1",
    provider: "DeepSeek",
  },
};

const SYSTEM_PROMPT = `You are CryptoDash Trade Bot, a crypto market analyst assistant embedded in a trading dashboard.
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
      customModels,
      modelOverrides,
    } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    // Credentials from request body or env vars
    const accessKeyId = credentials?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = credentials?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const region = credentials?.awsRegion || process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      return Response.json(
        {
          error: "AWS credentials not configured",
          hint: "Go to the Trade Bot tab → Settings to add your AWS Access Key ID and Secret Access Key.",
        },
        { status: 401 }
      );
    }

    // Resolve model ID — check custom models first, then built-in presets
    let modelId;
    let modelLabel;

    // Check if it's a user-added custom model
    if (customModels && Array.isArray(customModels)) {
      const custom = customModels.find((m) => m.key === modelKey);
      if (custom) {
        modelId = custom.id;
        modelLabel = custom.label;
      }
    }

    // Fall back to built-in presets (with possible user override)
    if (!modelId) {
      const preset = DEFAULT_MODELS[modelKey];
      if (preset) {
        // Use overridden model ID if provided, otherwise default
        modelId =
          (modelOverrides && modelOverrides[modelKey]) || preset.id;
        modelLabel = preset.label;
      } else {
        // Last resort — use the key as a raw model ID
        modelId = modelKey;
        modelLabel = modelKey;
      }
    }

    // Create client per request
    const client = new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
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
      modelId,
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
      model: modelLabel,
      usage: response.usage,
    });
  } catch (err) {
    console.error("Bedrock API error:", err);

    let hint;
    if (err.name === "AccessDeniedException" || err.name === "UnrecognizedClientException") {
      hint = "Invalid AWS credentials or you don't have access to this Bedrock model. Check your keys and enable model access in the AWS Bedrock console.";
    } else if (err.name === "ValidationException") {
      hint = "The selected model ID may be invalid or not available in your region. Check the model ID and ensure it's enabled in Bedrock → Model Access.";
    } else if (err.name === "ResourceNotFoundException") {
      hint = "This model is not available in your selected region. Try switching to us-east-1 (most models available there).";
    }

    return Response.json(
      { error: "AI request failed", details: err.message, hint },
      { status: err.name === "AccessDeniedException" ? 403 : 500 }
    );
  }
}

// Expose available built-in models
export async function GET() {
  const models = Object.entries(DEFAULT_MODELS).map(([key, val]) => ({
    key,
    id: val.id,
    label: val.label,
    provider: val.provider,
  }));
  return Response.json({ models });
}
