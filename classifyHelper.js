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

async function classifyComplaint(message) {
  const systemPrompt = `
Ты — строгий классификатор жалоб. Не объясняй. Не пиши полных предложений. Не добавляй формат.

Прочитай жалобу. Верни одно слово — категорию:

housing, transport, medicine, education, ecology, police, social, corruption, government, other

Если не относится ни к чему — верни: other
Если несколько тем — выбери самую опасную для жизни или здоровья
Симптомы (кашель, обморок, тошнота и т.п.) — medicine
Недомогание, отравление, ухудшение самочувствия — medicine
Огонь, дым, гарь — ecology
Угрозы, хамство, агрессия — police
Место (школа, автобус) ≠ категория, если есть угроза

Приоритет:
medicine
ecology
police
transport
housing
social
government
corruption
education

Ответ — только одно слово на английском. Без точек, кавычек и пояснений

Жалоба: ${message}
  `.trim();

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: systemPrompt,
          },
        ],
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

    const category = responseBody.content[0].text.trim().toLowerCase();
    return category;
  } catch (error) {
    console.error("Ошибка при обращении к Claude Haiku:", error);
    return "другое";
  }
}

module.exports = classifyComplaint;
