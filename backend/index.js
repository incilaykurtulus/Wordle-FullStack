const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const Joi = require("joi");
const words = require("./words.json");

dotenv.config();

const app = express();

// ── Security Headers (OWASP A05) ──
app.use(helmet());

// ── CORS – restrict to known origins (OWASP A05/A07) ──
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy violation"));
      }
    },
    credentials: true,
  })
);

// ── Body parser with size limit (OWASP A05 – DoS prevention) ──
app.use(express.json({ limit: "1kb" }));

// ── Global rate limiter (OWASP A04 – brute-force prevention) ──
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use(globalLimiter);

// ── Stricter rate limiter for game-critical endpoints ──
const gameLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { message: "Too many game requests, slow down." },
});

// ── MongoDB Connection ──
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("MongoDB bağlantısı başarılı");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

// ── Server-side sessions (OWASP A02/A07) ──
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
      httpOnly: true, // Prevents XSS access to cookie
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// ══════════════════════════════════════════════════
// ── Joi Validation Schemas (OWASP A03 – Injection) ──
// ══════════════════════════════════════════════════

const schemas = {
  playerName: Joi.string()
    .trim()
    .min(1)
    .max(30)
    .pattern(/^[a-zA-ZğüşöçıİĞÜŞÖÇ0-9\s]+$/)
    .required()
    .messages({
      "string.pattern.base": "Player name contains invalid characters.",
      "string.max": "Player name must be 30 characters or fewer.",
      "string.empty": "Player name cannot be empty.",
    }),

  guess: Joi.string()
    .trim()
    .length(5)
    .pattern(/^[a-zA-ZğüşöçıİĞÜŞÖÇ]+$/)
    .required()
    .messages({
      "string.length": "Guess must be exactly 5 characters.",
      "string.pattern.base": "Guess contains invalid characters.",
    }),

  scoreBody: Joi.object({
    name: Joi.string().trim().min(1).max(30).required(),
    attempts: Joi.number().integer().min(1).max(6).required(),
    result: Joi.string().valid("Kazandı", "Kaybetti").required(),
  }),

  playerUpdate: Joi.object({
    stats: Joi.object({
      gamesPlayed: Joi.number().integer().min(0).required(),
      wins: Joi.number().integer().min(0).required(),
      losses: Joi.number().integer().min(0).required(),
      streak: Joi.number().integer().min(0).required(),
      bestScore: Joi.alternatives()
        .try(Joi.number().integer().min(1).max(6), Joi.string().valid("-"))
        .required(),
    }).required(),
    achievements: Joi.array()
      .items(
        Joi.string().valid("firstWin", "fastSolver", "winStreak", "persistent")
      )
      .max(4)
      .required(),
  }),
};

// ── Validation middleware factory ──
function validate(schema, source = "body") {
  return (req, res, next) => {
    const data = source === "body" ? req[source] : req.params;
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        message: "Validation failed.",
        details: error.details.map((d) => d.message),
      });
    }
    if (source === "body") req.body = value;
    next();
  };
}

// ── Validate player name param middleware ──
function validatePlayerName(req, res, next) {
  const { error } = schemas.playerName.validate(req.params.name);
  if (error) {
    return res.status(400).json({ message: "Invalid player name." });
  }
  next();
}

// ══════════════════════════════════════════════════
// ── Mongoose Schemas (OWASP A03 – defense in depth) ──
// ══════════════════════════════════════════════════

const scoreSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30,
  },
  attempts: {
    type: Number,
    required: true,
    min: 1,
    max: 6,
  },
  result: {
    type: String,
    required: true,
    enum: ["Kazandı", "Kaybetti"],
  },
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

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 30,
  },
  stats: {
    gamesPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    wins: {
      type: Number,
      default: 0,
      min: 0,
    },
    losses: {
      type: Number,
      default: 0,
      min: 0,
    },
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    bestScore: {
      type: mongoose.Schema.Types.Mixed,
      default: "-",
    },
  },
  achievements: {
    type: [
      {
        type: String,
        enum: ["firstWin", "fastSolver", "winStreak", "persistent"],
      },
    ],
    default: [],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Score = mongoose.model("Score", scoreSchema);
const Word = mongoose.model("Word", wordSchema);
const Player = mongoose.model("Player", playerSchema);

// ══════════════════════════════════════════════════
// ── Helper Functions ──
// ══════════════════════════════════════════════════

function getDefaultStats() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestScore: "-",
  };
}

// Server-side guess evaluation (OWASP A01 – moved from client)
function evaluateGuessServer(guess, secretWord) {
  const result = Array(5).fill("red");
  const secretLetters = secretWord.split("");
  const remainingLetters = {};

  for (let i = 0; i < 5; i++) {
    if (guess[i] === secretLetters[i]) {
      result[i] = "green";
    } else {
      remainingLetters[secretLetters[i]] =
        (remainingLetters[secretLetters[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;
    if (remainingLetters[guess[i]] > 0) {
      result[i] = "orange";
      remainingLetters[guess[i]]--;
    }
  }

  return result;
}

// ══════════════════════════════════════════════════
// ── Word Upload (runs once on DB connection) ──
// ══════════════════════════════════════════════════

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
    console.error("Word upload error:", err.message);
  }
}

mongoose.connection.once("open", () => {
  uploadWordsToDatabase();
});

// ══════════════════════════════════════════════════
// ── API Routes ──
// ══════════════════════════════════════════════════

// ── Health check ──
app.get("/", (req, res) => {
  res.send("Wordle Backend Çalışıyor!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Backend aktif çalışıyor",
  });
});

// ── Scores: GET top 3 ──
app.get("/scores", async (req, res) => {
  try {
    const scores = await Score.find()
      .sort({ attempts: 1, createdAt: 1 })
      .limit(3);

    res.json(scores);
  } catch (err) {
    console.error("Scores fetch error:", err.message);
    res.status(500).json({ message: "Skorlar alınamadı." });
  }
});

// ── Scores: POST new score (validated) ──
app.post(
  "/scores",
  gameLimiter,
  validate(schemas.scoreBody),
  async (req, res) => {
    try {
      const { name, attempts, result } = req.body;

      const newScore = new Score({ name, attempts, result });
      await newScore.save();

      const topScores = await Score.find()
        .sort({ attempts: 1, createdAt: 1 })
        .limit(3);

      res.json(topScores);
    } catch (err) {
      console.error("Score save error:", err.message);
      res.status(500).json({ message: "Skor kaydedilemedi." });
    }
  }
);

// ── Player: GET (with validated name param) ──
app.get("/players/:name", validatePlayerName, async (req, res) => {
  try {
    const playerName = req.params.name.trim();

    let player = await Player.findOne({ name: playerName });

    if (!player) {
      player = new Player({
        name: playerName,
        stats: getDefaultStats(),
        achievements: [],
      });

      await player.save();
    }

    res.json(player);
  } catch (err) {
    console.error("Player fetch error:", err.message);
    res.status(500).json({ message: "Oyuncu bilgisi alınamadı." });
  }
});

// ── Player: PUT (with validated name param + body) ──
app.put(
  "/players/:name",
  validatePlayerName,
  validate(schemas.playerUpdate),
  async (req, res) => {
    try {
      const playerName = req.params.name.trim();
      const { stats, achievements } = req.body;

      const player = await Player.findOneAndUpdate(
        { name: playerName },
        {
          name: playerName,
          stats: stats || getDefaultStats(),
          achievements: achievements || [],
          updatedAt: new Date(),
        },
        {
          new: true,
          upsert: true,
        }
      );

      res.json(player);
    } catch (err) {
      console.error("Player update error:", err.message);
      res.status(500).json({ message: "Oyuncu bilgisi güncellenemedi." });
    }
  }
);

// ── Word validation (used by frontend to check if word is in dictionary) ──
app.post("/validate-word", gameLimiter, async (req, res) => {
  try {
    const { error, value } = schemas.guess.validate(req.body.guess);
    if (error) {
      return res.json({ valid: false });
    }

    const normalizedGuess = value.toLocaleUpperCase("tr-TR");
    const foundWord = await Word.findOne({ word: normalizedGuess });

    res.json({ valid: !!foundWord });
  } catch (err) {
    console.error("Word validation error:", err.message);
    res.status(500).json({ message: "Kelime kontrol edilemedi." });
  }
});

// ── Start new game: store secret word in session (OWASP A01 – server-side game state) ──
app.get("/random-word", gameLimiter, async (req, res) => {
  try {
    const wordCount = await Word.countDocuments();

    if (wordCount === 0) {
      return res.status(404).json({ message: "No words in database." });
    }

    const randomIndex = Math.floor(Math.random() * wordCount);
    const randomWord = await Word.findOne().skip(randomIndex);

    // Store in session – NEVER send to client
    req.session.secretWord = randomWord.word;
    req.session.attempts = 0;
    req.session.gameOver = false;

    res.json({
      message: "Game started. Secret word has been selected.",
      wordLength: randomWord.word.length,
    });
  } catch (err) {
    console.error("Random word error:", err.message);
    res.status(500).json({ message: "Rastgele kelime alınamadı." });
  }
});

// ── Check guess: evaluate server-side (OWASP A01 – access control) ──
app.post("/check-guess", gameLimiter, async (req, res) => {
  try {
    const { error, value } = schemas.guess.validate(req.body.guess);
    if (error) {
      return res.status(400).json({ message: "Invalid guess format." });
    }

    const secretWord = req.session.secretWord;
    if (!secretWord) {
      return res
        .status(400)
        .json({ message: "No active game. Start a new game first." });
    }

    if (req.session.gameOver) {
      return res
        .status(400)
        .json({ message: "Game is already over. Start a new game." });
    }

    const guess = value.toLocaleUpperCase("tr-TR");

    // Validate word exists in dictionary
    const foundWord = await Word.findOne({ word: guess });
    if (!foundWord) {
      return res.json({ valid: false, message: "Word not in dictionary." });
    }

    req.session.attempts += 1;

    // Evaluate guess server-side
    const result = evaluateGuessServer(guess, secretWord);
    const correct = guess === secretWord;
    const gameOver = correct || req.session.attempts >= 6;

    if (gameOver) {
      req.session.gameOver = true;
    }

    const response = {
      valid: true,
      guess,
      result,
      correct,
      attempts: req.session.attempts,
      gameOver,
    };

    // Only reveal secret word when game is over and player lost
    if (gameOver && !correct) {
      response.secretWord = secretWord;
    }

    res.json(response);
  } catch (err) {
    console.error("Check guess error:", err.message);
    res.status(500).json({ message: "Could not process guess." });
  }
});

// ── Hint: reveal one letter from session secret word ──
app.post("/hint", gameLimiter, (req, res) => {
  try {
    const secretWord = req.session.secretWord;
    if (!secretWord) {
      return res.status(400).json({ message: "No active game." });
    }

    if (req.session.gameOver) {
      return res.status(400).json({ message: "Game is already over." });
    }

    if (req.session.hintUsed) {
      return res.json({ alreadyUsed: true, message: "Hint already used." });
    }

    // Get known letters from request body (optional)
    const knownLetters = req.body.knownLetters || [];

    const secretLetters = [...new Set(secretWord.split(""))];
    const unknownLetters = secretLetters.filter(
      (letter) => !knownLetters.includes(letter)
    );

    if (unknownLetters.length === 0) {
      return res.json({
        alreadyUsed: false,
        message: "You already know all letters.",
      });
    }

    const randomLetter =
      unknownLetters[Math.floor(Math.random() * unknownLetters.length)];

    req.session.hintUsed = true;

    res.json({
      alreadyUsed: false,
      letter: randomLetter,
    });
  } catch (err) {
    console.error("Hint error:", err.message);
    res.status(500).json({ message: "Could not get hint." });
  }
});

// ── Game info (sanitized – no stack details) ──
app.get("/game-info", (req, res) => {
  res.json({
    gameName: "Full Stack Wordle Game",
    maxAttempts: 6,
    wordLength: 5,
    features: [
      "Random word selection",
      "Word validation",
      "Hint system",
      "Score tracking",
      "Player profiles",
      "Achievements",
    ],
  });
});

// REMOVED: /words endpoint (OWASP A01 – exposed entire word database)
// REMOVED: /player/:name duplicate routes (OWASP A08 – reduced attack surface)
// REMOVED: /check-guess with client-sent secretWord (OWASP A01 – broken access control)

// ══════════════════════════════════════════════════
// ── Global Error Handler (OWASP A09) ──
// ══════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error." });
});

// ══════════════════════════════════════════════════
// ── Start Server ──
// ══════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});