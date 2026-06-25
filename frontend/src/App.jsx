import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [secretWord, setSecretWord] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [currentGuess, setCurrentGuess] = useState("");
  const [guesses, setGuesses] = useState([]);
  const [message, setMessage] = useState("");
  const [hintMessage, setHintMessage] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [resultText, setResultText] = useState("");
  const [topScores, setTopScores] = useState([]);
  const [keyboardColors, setKeyboardColors] = useState({});
  const [revealedRow, setRevealedRow] = useState(-1);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestScore: "-",
  });

  useEffect(() => {
    getRandomWordFromBackend();
    getScoresFromBackend();

    const savedStats = JSON.parse(localStorage.getItem("wordleStats")) || {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestScore: "-",
    };

    setStats(savedStats);
  }, []);

  async function getRandomWordFromBackend() {
    const response = await fetch("http://localhost:5000/random-word");
    const data = await response.json();

    setSecretWord(data.word.toLocaleUpperCase("tr-TR"));
  }

  async function getScoresFromBackend() {
    const response = await fetch("http://localhost:5000/scores");
    const data = await response.json();

    setTopScores(data);
  }

  function getHint() {
    if (hintUsed) {
      setHintMessage("İpucu hakkını zaten kullandın.");
      return;
    }

    if (!secretWord) {
      setHintMessage("Kelime henüz hazır değil.");
      return;
    }

    const secretLetters = [...new Set(secretWord.split(""))];

    const unknownLetters = secretLetters.filter(
      (letter) =>
        keyboardColors[letter] !== "green" &&
        keyboardColors[letter] !== "orange"
    );

    if (unknownLetters.length === 0) {
      setHintMessage(
        "Zaten kelimedeki harfleri biliyorsun, ipucu hakkın yanmadı."
      );
      return;
    }

    const randomLetter =
      unknownLetters[Math.floor(Math.random() * unknownLetters.length)];

    setHintMessage(`İpucu: Kelimenin içinde "${randomLetter}" harfi var.`);
    setHintUsed(true);
  }

  async function validateWord(word) {
    const response = await fetch("http://localhost:5000/validate-word", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ guess: word }),
    });

    const data = await response.json();
    return data.valid;
  }

  async function saveScore(attempts) {
    const newScore = {
      name: playerName,
      attempts: attempts,
      result: "Kazandı",
    };

    const response = await fetch("http://localhost:5000/scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newScore),
    });

    const data = await response.json();
    setTopScores(data);
  }

  function saveStats(result, attempts) {
    let updatedStats = { ...stats };

    updatedStats.gamesPlayed = updatedStats.gamesPlayed + 1;

    if (result === "win") {
      updatedStats.wins = updatedStats.wins + 1;
      updatedStats.streak = updatedStats.streak + 1;

      if (updatedStats.bestScore === "-" || attempts < updatedStats.bestScore) {
        updatedStats.bestScore = attempts;
      }
    } else {
      updatedStats.losses = updatedStats.losses + 1;
      updatedStats.streak = 0;
    }

    setStats(updatedStats);
    localStorage.setItem("wordleStats", JSON.stringify(updatedStats));
  }

  function updateKeyboardColors(word, result) {
    const newKeyboardColors = { ...keyboardColors };

    word.split("").forEach((letter, index) => {
      const color = result[index];

      if (color === "green") {
        newKeyboardColors[letter] = "green";
      } else if (color === "orange") {
        if (newKeyboardColors[letter] !== "green") {
          newKeyboardColors[letter] = "orange";
        }
      } else if (color === "red") {
        if (
          newKeyboardColors[letter] !== "green" &&
          newKeyboardColors[letter] !== "orange"
        ) {
          newKeyboardColors[letter] = "red";
        }
      }
    });

    setKeyboardColors(newKeyboardColors);
  }

  function evaluateGuess(word) {
  const result = Array(5).fill("red");
  const secretLetters = secretWord.split("");
  const remainingLetters = {};

  for (let i = 0; i < 5; i++) {
    if (word[i] === secretLetters[i]) {
      result[i] = "green";
    } else {
      remainingLetters[secretLetters[i]] =
        (remainingLetters[secretLetters[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;

    const letter = word[i];

    if (remainingLetters[letter] > 0) {
      result[i] = "orange";
      remainingLetters[letter]--;
    }
  }

  return result;
}

  async function submitGuess() {
    if (gameOver) return;

    if (!secretWord) {
      setMessage("Kelime henüz hazır değil.");
      return;
    }

    if (playerName.trim() === "") {
      setMessage("Önce oyuncu adını gir.");
      return;
    }

    if (currentGuess.length !== 5) {
      setMessage("5 harf yazmalısın.");
      return;
    }

    const word = currentGuess.toLocaleUpperCase("tr-TR");

    const isValidWord = await validateWord(word);

    if (!isValidWord) {
      setMessage("Bu kelime sözlükte yok.");
      return;
    }

    const result = evaluateGuess(word);

    updateKeyboardColors(word, result);

    const newGuesses = [...guesses, { word, result }];
    setGuesses(newGuesses);
    setRevealedRow(newGuesses.length - 1);
    setCurrentGuess("");

    if (word === secretWord) {
      setMessage("Kazandın!");
      setResultText("Kazandı");
      setGameOver(true);
      saveScore(newGuesses.length);
      saveStats("win", newGuesses.length);
    } else if (newGuesses.length >= 6) {
      setMessage("Kaybettin! Kelime: " + secretWord);
      setResultText("Kaybetti");
      setGameOver(true);
      saveStats("loss", newGuesses.length);
    } else {
      setMessage("Tekrar dene.");
    }
  }

  function handleKeyDown(e) {
    if (gameOver) return;
    if (e.target.tagName === "INPUT") return;

    if (e.key === "Enter") {
      submitGuess();
    } else if (e.key === "Backspace") {
      setCurrentGuess((prev) => prev.slice(0, -1));
    } else if (/^[a-zA-ZğüşöçıİĞÜŞÖÇ]$/.test(e.key) && currentGuess.length < 5) {
      setCurrentGuess((prev) => prev + e.key.toLocaleUpperCase("tr-TR"));
    }
  }

  function newGame() {
    getRandomWordFromBackend();
    getScoresFromBackend();
    setCurrentGuess("");
    setGuesses([]);
    setMessage("");
    setHintMessage("");
    setHintUsed(false);
    setGameOver(false);
    setResultText("");
    setKeyboardColors({});
    setRevealedRow(-1);
  }

  function getRowLetters(rowIndex) {
    if (guesses[rowIndex]) return guesses[rowIndex].word.padEnd(5).split("");
    if (rowIndex === guesses.length) return currentGuess.padEnd(5).split("");
    return ["", "", "", "", ""];
  }

  function getRowColors(rowIndex) {
    if (guesses[rowIndex]) return guesses[rowIndex].result;
    return ["", "", "", "", ""];
  }

  function getBoxBackgroundColor(color) {
    if (color === "orange") return "#ff8c00";
    if (color === "green") return "green";
    if (color === "red") return "red";
    return "transparent";
  }

  function getKeyboardBackgroundColor(letter) {
    const color = keyboardColors[letter];

    if (color === "orange") return "#ff8c00";
    if (color === "green") return "green";
    if (color === "red") return "red";

    return "#d3d6da";
  }

  const keyboardRows = [
    "ERTYUIOPĞÜ".split(""),
    "ASDFGHJKLŞİ".split(""),
    "ZXCVBNMÖÇ".split(""),
  ];

  const medals = ["🥇", "🥈", "🥉"];
  const winRate =
    stats.gamesPlayed === 0
      ? 0
      : Math.round((stats.wins / stats.gamesPlayed) * 100);

  return (
    <div className="game" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="hero">
        <p className="mini-title"> Turkish Wordle</p>
        <h1>WORDLE GAME</h1>
        <p className="subtitle"> Kelimeyi 6 denemede bul!!</p>
      </div>

      <div className="stats-panel">
        <div className="stat-card">
          <span>🎮</span>
          <h4>Oyun</h4>
          <p>{stats.gamesPlayed}</p>
        </div>

        <div className="stat-card">
          <span>🏆</span>
          <h4>En İyi</h4>
          <p>{stats.bestScore}</p>
        </div>

        <div className="stat-card">
          <span>🔥</span>
          <h4>Seri</h4>
          <p>{stats.streak}</p>
        </div>

        <div className="stat-card">
          <span>📊</span>
          <h4>Oran</h4>
          <p>%{winRate}</p>
        </div>
      </div>

      <input
        className="name-input"
        type="text"
        placeholder="Oyuncu adını gir"
        value={playerName}
        disabled={gameOver}
        onChange={(e) => setPlayerName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && playerName.trim() !== "") {
            e.target.blur();
            document.querySelector(".game")?.focus();
            setMessage("Kelimeni yazabilirsin :)");
          }
        }}
      />

      <p className="game-info">Kelime gir ve Enter'a bas.</p>

      <div>
        <button onClick={newGame}>Yeni Oyun</button>
        <button onClick={getHint} disabled={hintUsed || gameOver}>
          İpucu Al
        </button>
      </div>

      {hintMessage && <p className="hint-message">{hintMessage}</p>}

      <h3>{message}</h3>

      {gameOver && (
        <div className="popup-overlay">
          <div className="popup-card">
            {resultText === "Kazandı" ? (
              <>
                <h2>🎉 TEBRİKLER 🎉</h2>
                <p>{playerName}</p>
                <p>{guesses.length} denemede buldun!</p>
                <p>Kelime: {secretWord}</p>
              </>
            ) : (
              <>
                <h2>😢 OYUN BİTTİ</h2>
                <p>Kelime:</p>
                <h3>{secretWord}</h3>
              </>
            )}

            <button onClick={newGame}>Tekrar Oyna</button>
          </div>
        </div>
      )}

      <div className="board">
        {Array.from({ length: 6 }).map((_, rowIndex) => {
          const letters = getRowLetters(rowIndex);
          const colors = getRowColors(rowIndex);

          return (
            <div key={rowIndex} className="wordle-row">
              {letters.map((letter, letterIndex) => (
                <span
                  key={letterIndex}
                  className={
                    rowIndex === revealedRow
                      ? `wordle-box reveal-${letterIndex}`
                      : rowIndex === guesses.length &&
                        letterIndex === currentGuess.length &&
                        !gameOver &&
                        playerName.trim() !== ""
                      ? "wordle-box active-box"
                      : "wordle-box"
                  }
                  style={{
                    backgroundColor: getBoxBackgroundColor(colors[letterIndex]),
                  }}
                >
                  {letter}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="keyboard">
        {keyboardRows.map((row, rowIndex) => (
          <div key={rowIndex} className="keyboard-row">
            {row.map((letter) => (
              <button
                key={letter}
                className="keyboard-key"
                style={{
                  backgroundColor: getKeyboardBackgroundColor(letter),
                  color: keyboardColors[letter] ? "white" : "black",
                }}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="leaderboard">
        <h2>Top 3 Scores</h2>

        {topScores.length === 0 ? (
          <p>Henüz skor yok.</p>
        ) : (
          topScores.map((score, index) => (
            <p key={score._id || index}>
              {medals[index]} {score.name} - {score.attempts} deneme
            </p>
          ))
        )}
      </div>
    </div>
  );
}

export default App;