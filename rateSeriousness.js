const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function rateSeriousness(message) {
  const systemPrompt = `
Оцени, насколько жалоба звучит правдоподобно и серьёзно, по шкале от 0 (полная чушь/шутка) до 10 (очень серьёзная и реальная жалоба). Не объясняй.
Оценивай уровень серьёзности с учётом общего смысла. Если в жалобе присутствует явный абсурд или фантазия, ставь оценку ближе к 0.
0 — шутка, сарказм, абсурд, бред, невозможная ситуация
1–3 — звучит сомнительно, подозрительно, похоже на выдумку
4–6 — возможно, но с натяжкой
7–9 — вероятно, звучит серьёзно
10 — совершенно серьёзная и правдоподобная жалоба
Ответь только числом от 0 до 10.

Жалоба: ${message}
  `.trim();

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: systemPrompt }],
      },
    ],
    temperature: 0,
    top_p: 1,
    max_tokens: 10,
  };

  try {
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const bodyBytes = await response.body.transformToString();
    const responseBody = JSON.parse(bodyBytes);

    const score = parseFloat(responseBody.content[0].text.trim());

    return isNaN(score) ? null : score;
  } catch (error) {
    console.error("Ошибка при оценке серьёзности:", error);
    return null;
  }
}

module.exports = rateSeriousness;
