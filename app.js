require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { Sequelize } = require('sequelize');
const { sequelize, Complaint, User } = require("./models");
const classifyComplaint = require("./classifyHelper");
const rateSeriousness = require("./rateSeriousness");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const app = express();
app.use(bodyParser.json());
const cors = require('cors');
app.use(cors({
  origin: "*",
}));

// Middleware to decode status
// const decodeStatus = (req, res, next) => {
//   const statusMap = {
//     vse: "все",
//     novaya: "новая",
//     v_obrabotke: "в обработке",
//     ojidaet_utochneniya: "ожидает уточнения",
//     otklonena: "отклонена",
//     zavershena: "завершена"
//   };

//   if (req.query.status && statusMap[req.query.status]) {
//     req.query.status = statusMap[req.query.status];
//   }
//   next();
// };

app.post("/submit-complaint", async (req, res) => {
  const { complaint, address } = req.body;

  if (!complaint)
    return res.status(400).json({ error: "Поле жалобы обязательно для заполнения" });

  try {
    const category = await classifyComplaint(complaint);
    const seriousnessScore = await rateSeriousness(complaint);

    const newComplaint = await Complaint.create({
      complaint,
      address,
      category,
      status: "new",
      seriousnessScore,
    });

    res.status(201).json({ 
      message: "Жалоба успешно создана", 
      data: newComplaint 
    });
  } catch (error) {
    console.error("Ошибка при создании жалобы:", error);
    res.status(500).json({ error: "Произошла ошибка при создании жалобы" });
  }
});

app.get("/complaints", async (req, res) => {
  try {
    const { complaint_like, status, specialization } = req.query;
    console.log("Параметры запроса:", { complaint_like, status, specialization });

    let whereClause = {};

    if (complaint_like && complaint_like.trim() !== "") {
      whereClause.complaint = {
        [Sequelize.Op.like]: `%${complaint_like}%`,
      };
    }

    if (status && status.trim() !== "" && status !== "vse" && status !== "все") {
      whereClause.status = {
        [Sequelize.Op.iLike]: status,
      };
    }

    if (specialization && specialization.trim() !== "") {
      whereClause.category = specialization.trim();
    }

    console.log("Where clause:", whereClause);

    const complaints = await Complaint.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    console.log(`Найдено жалоб: ${complaints.length}`);

    res.json({
      message: "Жалобы успешно получены",
      data: complaints
    });
  } catch (error) {
    console.error("Ошибка при получении жалоб:", error);
    res.status(500).json({ error: "Произошла ошибка при получении жалоб" });
  }
});


app.patch("/complaints/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  try {
    const complaint = await Complaint.findByPk(id);
    if (!complaint) {
      return res.status(404).json({ error: "Жалоба не найдена" });
    }

    await complaint.update(updatedData);
    await complaint.reload();

    res.json({
      message: "Жалоба успешно обновлена",
      data: complaint.toJSON()
    });
  } catch (error) {
    console.error("Ошибка при обновлении жалобы:", error);
    res.status(500).json({ error: "Произошла ошибка при обновлении жалобы" });
  }
});

app.post("/complaints", async (req, res) => {
  try {
    const newComplaint = await Complaint.create(req.body);
    res.status(201).json({
      message: "Жалоба успешно создана",
      data: newComplaint,
    });
  } catch (error) {
    console.error("Ошибка при создании жалобы:", error);
    res.status(500).json({ error: "Произошла ошибка при создании жалобы" });
  }
});

app.delete("/complaints/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const complaint = await Complaint.findByPk(id);
    if (!complaint) {
      return res.status(404).json({ error: "Жалоба не найдена" });
    }

    await complaint.destroy();

    res.json({ message: "Жалоба успешно удалена" });
  } catch (error) {
    console.error("Ошибка при удалении жалобы:", error);
    res.status(500).json({ error: "Произошла ошибка при удалении жалобы" });
  }
});

app.post("/users", async (req, res) => {
  try {
    const { login, password, specialization } = req.body;

    if (!login || !password || !specialization) {
      return res.status(400).json({ 
        error: "Необходимо указать логин, пароль и специализацию" 
      });
    }

    const existingUser = await User.findOne({ where: { login } });
    if (existingUser) {
      return res.status(400).json({
        error: "Пользователь с таким логином уже существует"
      });
    }

    const newUser = await User.create({
      login,
      password,
      specialization
    });

    const userWithoutPassword = {
      id: newUser.id,
      login: newUser.login,
      specialization: newUser.specialization,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt
    };

    res.status(201).json({
      message: "Пользователь успешно создан",
      data: userWithoutPassword
    });

  } catch (error) {
    console.error("Ошибка при создании пользователя:", error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        error: "Пользователь с таким логином уже существует" 
      });
    }
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: "Указана недопустимая специализация" 
      });
    }

    res.status(500).json({ 
      error: "Произошла ошибка при создании пользователя" 
    });
  }
});

app.get("/users/login/:login", async (req, res) => {
  try {
    const { login } = req.params;

    if (!login) {
      return res.status(400).json({
        error: "Необходимо указать логин пользователя"
      });
    }

    const user = await User.findOne({
      where: { login }
    });

    if (!user) {
      return res.status(404).json({ 
        error: "Пользователь не найден" 
      });
    }

    const userWithoutPassword = {
      id: user.id,
      login: user.login,
      specialization: user.specialization,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      message: "Пользователь успешно найден",
      data: userWithoutPassword
    });
  } catch (error) {
    console.error("Ошибка при поиске пользователя:", error);
    res.status(500).json({ 
      error: "Произошла ошибка при поиске пользователя" 
    });
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Необходимо указать ID пользователя"
      });
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ 
        error: "Пользователь не найден" 
      });
    }

    const userWithoutPassword = {
      id: user.id,
      login: user.login,
      specialization: user.specialization,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      message: "Пользователь успешно найден",
      data: userWithoutPassword
    });
  } catch (error) {
    console.error("Ошибка при поиске пользователя:", error);
    
    if (error.name === 'SequelizeDatabaseError') {
      return res.status(400).json({ 
        error: "Некорректный формат ID пользователя" 
      });
    }

    res.status(500).json({ 
      error: "Произошла ошибка при поиске пользователя" 
    });
  }
});

app.post("/recommendation", async (req, res) => {
  const { complaint } = req.body;

  if (!complaint) {
    return res.status(400).json({ error: "Поле жалобы обязательно для заполнения" });
  }

  try {
    const recommendation = await generateRecommendation(complaint);
    res.status(200).json({
      message: "Рекомендация успешно сгенерирована",
      data: recommendation,
    });
  } catch (error) {
    console.error("Ошибка при генерации рекомендации:", error);
    res.status(500).json({ error: "Произошла ошибка при генерации рекомендации" });
  }
});

async function generateRecommendation(complaint) {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const systemPrompt = `
Ты — советник по регламенту для госслужащих КР.
Тебе, как ответственному должностному лицу, поступила следующая жалоба от гражданина.
Дай четкий план действий по регламенту:

1. Необходимые действия по порядку с указанием сроков
2. Какие службы нужно задействовать
3. Какие документы нужно оформить
4. В какие сроки нужно отчитаться

Формат ответа:
- Четкие пункты
- Конкретные сроки
- Ссылки на НПА
- Без лишних слов

Жалоба гражданина: ${complaint}
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
    temperature: 0.3, 
    max_tokens: 800, 
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

    const recommendation = responseBody.content[0].text.trim();
    return recommendation;
  } catch (error) {
    console.error("Ошибка при обращении к Claude Haiku:", error);
    return "Не удалось сгенерировать рекомендацию.";
  }
}

sequelize.sync().then(() => {
  app.listen(3001, () => {
    console.log("Сервер запущен на http://localhost:3001");
  });
});