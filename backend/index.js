const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const words = require("./words.json");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("MongoDB bağlantısı başarılı");
  })
  .catch((err) => {
    console.log("MongoDB hata:", err.message);
  });

const scoreSchema = new mongoose.Schema({
  name: String,
  attempts: Number,
  result: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const wordSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
    unique: true,
  },
});

const Score = mongoose.model("Score", scoreSchema);
const Word = mongoose.model("Word", wordSchema);

async function uploadWordsToDatabase() {
  try {
    const wordCount = await Word.countDocuments();

    if (wordCount === 0) {
      const wordList = words.map((item) => ({
        word: item.toLocaleUpperCase("tr-TR"),
      }));

      await Word.insertMany(wordList);

      console.log("Kelimeler MongoDB'ye yüklendi.");
    } else {
      console.log("Kelimeler zaten MongoDB'de var.");
    }
  } catch (err) {
    console.log("Kelime yükleme hatası:", err.message);
  }
}

mongoose.connection.once("open", () => {
  uploadWordsToDatabase();
});

app.get("/", (req, res) => {
  res.send("Wordle Backend Çalışıyor!");
});

app.get("/scores", async (req, res) => {
  try {
    const scores = await Score.find()
      .sort({ attempts: 1, createdAt: 1 })
      .limit(3);

    res.json(scores);
  } catch (err) {
    res.status(500).json({
      message: "Skorlar alınamadı.",
      error: err.message,
    });
  }
});

app.post("/scores", async (req, res) => {
  try {
    const { name, attempts, result } = req.body;

    const newScore = new Score({
      name,
      attempts,
      result,
    });

    await newScore.save();

    const topScores = await Score.find()
      .sort({ attempts: 1, createdAt: 1 })
      .limit(3);

    res.json(topScores);
  } catch (err) {
    res.status(500).json({
      message: "Skor kaydedilemedi.",
      error: err.message,
    });
  }
});

app.get("/words", async (req, res) => {
  try {
    const wordList = await Word.find();

    res.json(wordList);
  } catch (err) {
    res.status(500).json({
      message: "Kelimeler alınamadı.",
      error: err.message,
    });
  }
});

app.post("/validate-word", async (req, res) => {
  try {
    const { guess } = req.body;

    const normalizedGuess = guess.toLocaleUpperCase("tr-TR");

    const foundWord = await Word.findOne({
      word: normalizedGuess,
    });

    res.json({
      valid: foundWord ? true : false,
    });
  } catch (err) {
    res.status(500).json({
      message: "Kelime kontrol edilemedi.",
      error: err.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Backend aktif çalışıyor",
  });
});

app.get("/random-word", async (req, res) => {
  try {
    const wordCount = await Word.countDocuments();

    if (wordCount === 0) {
      return res.status(404).json({
        message: "Database içinde kelime bulunamadı.",
      });
    }

    const randomIndex = Math.floor(Math.random() * wordCount);

    const randomWord = await Word.findOne().skip(randomIndex);

    res.json({
      word: randomWord.word,
    });
  } catch (err) {
    res.status(500).json({
      message: "Rastgele kelime alınamadı.",
      error: err.message,
    });
  }
});

app.post("/check-guess", (req, res) => {
  const { guess, secretWord } = req.body;

  const result = guess.split("").map((letter, index) => {
    if (letter === secretWord[index]) {
      return "green";
    } else if (secretWord.includes(letter)) {
      return "orange";
    } else {
      return "red";
    }
  });

  res.json({
    guess,
    result,
    correct: guess === secretWord,
  });
});

app.get("/game-info", (req, res) => {
  res.json({
    gameName: "Full Stack Wordle Game",
    maxAttempts: 6,
    wordLength: 5,
    backend: "Node.js + Express",
    frontend: "React",
    database: "MongoDB",
    features: [
      "Random word API",
      "Word validation",
      "Hint system",
      "Score system",
      "MongoDB score storage",
      "MongoDB word storage",
    ],
  });
});

app.listen(5000, () => {
  console.log("Server 5000 portunda çalışıyor");
});