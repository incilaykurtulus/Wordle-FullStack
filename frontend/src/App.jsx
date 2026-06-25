import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [secretWord, setSecretWord] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [nameReady, setNameReady] = useState(false);
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
  const [shakeRow, setShakeRow] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);

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

  function triggerShake() {
    setShakeRow(guesses.length);
    setTimeout(() => setShakeRow(-1), 500);
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
      triggerShake();
      return;
    }

    if (!nameReady) {
      setMessage("İsmini yazdıktan sonra Enter'a bas.");
      triggerShake();
      return;
    }

    if (currentGuess.length !== 5) {
      setMessage("5 harf yazmalısın.");
      triggerShake();
      return;
    }

    const word = currentGuess.toLocaleUpperCase("tr-TR");
    const isValidWord = await validateWord(word);

    if (!isValidWord) {
      setMessage("Bu kelime sözlükte yok.");
      triggerShake();
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
      setTimeout(() => setGameOver(true), 900);
      saveScore(newGuesses.length);
      saveStats("win", newGuesses.length);
    } else if (newGuesses.length >= 6) {
      setMessage("Kaybettin! Kelime: " + secretWord);
      setResultText("Kaybetti");
      setTimeout(() => setGameOver(true), 900);
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
      handleBackspace();
    } else if (/^[a-zA-ZğüşöçıİĞÜŞÖÇ]$/.test(e.key) && currentGuess.length < 5) {
      if (!nameReady) {
        setMessage("Önce ismini yazıp Enter'a bas.");
        triggerShake();
        return;
      }

      setCurrentGuess((prev) => prev + e.key.toLocaleUpperCase("tr-TR"));
    }
  }

  function handleVirtualKey(letter) {
    if (gameOver) return;

    if (playerName.trim() === "") {
      setMessage("Önce oyuncu adını gir.");
      triggerShake();
      return;
    }

    if (!nameReady) {
      setMessage("Önce ismini yazıp Enter'a bas.");
      triggerShake();
      return;
    }

    if (currentGuess.length < 5) {
      setCurrentGuess((prev) => prev + letter);
    }

    document.querySelector(".game")?.focus();
  }

  function handleBackspace() {
    if (gameOver) return;
    setCurrentGuess((prev) => prev.slice(0, -1));
    document.querySelector(".game")?.focus();
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
    setShakeRow(-1);
    setNameReady(false);
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
    if (color === "orange") return "#c9a227";
    if (color === "green") return "#2f9e44";
    if (color === "red") return "#3a3f4b";
    return "transparent";
  }

  const keyboardRows = [
    "ERTYUIOPĞÜ".split(""),
    "ASDFGHJKLŞİ".split(""),
    "ZXCVBNMÖÇ".split(""),
  ];

  const medals = ["1.", "2.", "3."];

  const winRate =
    stats.gamesPlayed === 0
      ? 0
      : Math.round((stats.wins / stats.gamesPlayed) * 100);

  return (
    <div className="game" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="hero">
        <p className="mini-title">Turkish Wordle</p>
        <h1>WORDLE GAME</h1>
        <p className="subtitle">Kelimeyi 6 denemede bul!</p>

        <button className="help-button" onClick={() => setShowHelp(true)}>
          Nasıl Oynanır?
        </button>
      </div>

      {showHelp && (
        <div className="popup-overlay">
          <div className="popup-card help-card">
            <h2>Nasıl Oynanır?</h2>
            <p>5 harfli kelimeyi 6 denemede bulmaya çalış.</p>

            <div className="help-line">
              <span className="help-box green-box">A</span>
              <p>Yeşil: Harf doğru yerde.</p>
            </div>

            <div className="help-line">
              <span className="help-box orange-box">A</span>
              <p>Sarı: Harf kelimede var ama yeri yanlış.</p>
            </div>

            <div className="help-line">
              <span className="help-box red-box">A</span>
              <p>Gri: Harf kelimede yok.</p>
            </div>

            <button onClick={() => setShowHelp(false)}>Kapat</button>
          </div>
        </div>
      )}

      <div className="stats-panel">
        <div className="stat-card">
          <span>Games</span>
          <h4>Oyun</h4>
          <p>{stats.gamesPlayed}</p>
        </div>

        <div className="stat-card">
          <span>Best</span>
          <h4>En İyi</h4>
          <p>{stats.bestScore}</p>
        </div>

        <div className="stat-card">
          <span>Streak</span>
          <h4>Seri</h4>
          <p>{stats.streak}</p>
        </div>

        <div className="stat-card">
          <span>Win</span>
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
        onChange={(e) => {
          setPlayerName(e.target.value);
          setNameReady(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && playerName.trim() !== "") {
            setNameReady(true);
            e.target.blur();
            document.querySelector(".game")?.focus();
            setMessage("Kelimeni yazabilirsin.");
          }
        }}
      />

      <p className="game-info">Kelime gir ve Enter'a bas.</p>

      <div className="action-buttons">
        <button onClick={newGame}>Yeni Oyun</button>
        <button onClick={getHint} disabled={hintUsed || gameOver}>
          İpucu Al
        </button>
      </div>

      {hintMessage && <p className="hint-message">{hintMessage}</p>}

      {message && <h3 className="message">{message}</h3>}

      {gameOver && (
        <div className="popup-overlay">
          <div
            className={
              resultText === "Kazandı"
                ? "popup-card win-popup"
                : "popup-card lose-popup"
            }
          >
            {resultText === "Kazandı" ? (
              <>
                <div className="confetti">
                  {Array.from({ length: 18 }).map((_, index) => (
                    <span key={index}></span>
                  ))}
                </div>

                <div className="popup-icon win-icon">Trophy</div>
                <h2>Congratulations!</h2>
                <p>{playerName}, kelimeyi buldun.</p>
                <p>
                  Deneme sayısı: <strong>{guesses.length}</strong>
                </p>
                <p>
                  Kelime: <strong>{secretWord}</strong>
                </p>
              </>
            ) : (
              <>
                <div className="popup-icon lose-icon">X</div>
                <h2>Better luck next time!</h2>
                <p>Doğru kelime:</p>
                <h3>{secretWord}</h3>
              </>
            )}

            <div className="end-stats">
              <div>
                <span>Games</span>
                <strong>{stats.gamesPlayed}</strong>
              </div>

              <div>
                <span>Wins</span>
                <strong>{stats.wins}</strong>
              </div>

              <div>
                <span>Losses</span>
                <strong>{stats.losses}</strong>
              </div>

              <div>
                <span>Win Rate</span>
                <strong>%{winRate}</strong>
              </div>

              <div>
                <span>Streak</span>
                <strong>{stats.streak}</strong>
              </div>

              <div>
                <span>Best</span>
                <strong>{stats.bestScore}</strong>
              </div>
            </div>

            <button onClick={newGame}>
              {resultText === "Kazandı" ? "Play Again" : "Try Again"}
            </button>
          </div>
        </div>
      )}

      <div className="board">
        {Array.from({ length: 6 }).map((_, rowIndex) => {
          const letters = getRowLetters(rowIndex);
          const colors = getRowColors(rowIndex);

          return (
            <div
              key={rowIndex}
              className={
                rowIndex === shakeRow ? "wordle-row shake-row" : "wordle-row"
              }
            >
              {letters.map((letter, letterIndex) => (
                <span
                  key={letterIndex}
                  className={
                    rowIndex === revealedRow
                      ? `wordle-box reveal-box reveal-${letterIndex}`
                      : rowIndex === guesses.length && letter
                      ? "wordle-box pop-box"
                      : rowIndex === guesses.length &&
                        letterIndex === currentGuess.length &&
                        !gameOver &&
                        nameReady
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
                className={`keyboard-key ${
                  keyboardColors[letter] ? `key-${keyboardColors[letter]}` : ""
                }`}
                onClick={() => handleVirtualKey(letter)}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}

        <div className="keyboard-row control-row">
          <button className="keyboard-key control-key" onClick={handleBackspace}>
            Sil
          </button>

          <button className="keyboard-key control-key enter-key" onClick={submitGuess}>
            Enter
          </button>
        </div>
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

      <footer className="footer">
        <p>Made by İncilay Kurtuluş</p>
        <span>Computer Engineering • Full-Stack Wordle Project</span>
      </footer>
    </div>
  );
}

export default App;