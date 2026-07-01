import { useEffect, useState } from "react";
import "./App.css";

// ── API base URL (uses Vite proxy in dev, direct URL in prod) ──
const API_BASE = import.meta.env.VITE_API_URL || "/api";

function App() {
  // SECURITY: secretWord is NO LONGER stored client-side.
  // It lives in the server session and is never exposed until game over.
  const [revealedWord, setRevealedWord] = useState(""); // Only set on game over
  const [gameReady, setGameReady] = useState(false); // True when server has selected a word
  const [playerName, setPlayerName] = useState("");
  const [tempName, setTempName] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
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
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [newAchievements, setNewAchievements] = useState([]);
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [achievementToast, setAchievementToast] = useState(null);

  const achievementList = [
    { id: "firstWin", title: "First Win", description: "İlk galibiyetini aldın." },
    { id: "fastSolver", title: "Fast Solver", description: "3 veya daha az denemede bildin." },
    { id: "winStreak", title: "Win Streak", description: "3 seri galibiyet yaptın." },
    { id: "persistent", title: "Persistent", description: "10 oyun oynadın." },
  ];

  const [stats, setStats] = useState({
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    bestScore: "-",
  });

  useEffect(() => {
    startNewGameSession();
    getScoresFromBackend();

    setPlayerName("");
    setTempName("");
    setNameReady(false);
    setShowWelcome(true);
    setStats(getDefaultStats());
    setAchievements([]);
  }, []);

  useEffect(() => {
    let interval = null;

    if (timerActive && !gameOver) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [timerActive, gameOver]);

  useEffect(() => {
    if (achievementToast) {
      const timeout = setTimeout(() => {
        setAchievementToast(null);
      }, 3500);

      return () => clearTimeout(timeout);
    }
  }, [achievementToast]);

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  function getDefaultStats() {
    return {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      bestScore: "-",
    };
  }

  async function loadPlayerData(name) {
    try {
      const response = await fetch(
        `${API_BASE}/players/${encodeURIComponent(name.trim())}`,
        { credentials: "include" }
      );
      const data = await response.json();

      setStats(data.stats || getDefaultStats());
      setAchievements(data.achievements || []);
    } catch (err) {
      console.log("Oyuncu bilgisi alınamadı:", err.message);
      setStats(getDefaultStats());
      setAchievements([]);
    }

    setNewAchievements([]);
    setAchievementToast(null);
  }

  async function savePlayerData(name, updatedStats, updatedAchievements) {
    try {
      await fetch(
        `${API_BASE}/players/${encodeURIComponent(name.trim())}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            stats: updatedStats,
            achievements: updatedAchievements,
          }),
        }
      );
    } catch (err) {
      console.log("Oyuncu bilgisi kaydedilemedi:", err.message);
    }
  }

  async function startGameWithName() {
    if (tempName.trim() === "") {
      setMessage("Önce oyuncu adını gir.");
      return;
    }

    const finalName = tempName.trim();

    setPlayerName(finalName);
    await loadPlayerData(finalName);
    setNameReady(true);
    setShowWelcome(false);
    setTimerSeconds(0);
    setTimerActive(true);
    setMessage("Kelimeni yazabilirsin.");

    setTimeout(() => {
      document.querySelector(".game")?.focus();
    }, 100);
  }

  function changePlayer() {
    setTempName(playerName);
    setShowWelcome(true);
    setNameReady(false);
    setTimerActive(false);
    setCurrentGuess("");
    setMessage("");
  }

  // SECURITY: Server selects the word and stores it in session.
  // The word is NEVER sent to the client.
  async function startNewGameSession() {
    try {
      const response = await fetch(`${API_BASE}/random-word`, {
        credentials: "include",
      });
      const data = await response.json();

      if (response.ok) {
        setGameReady(true);
        setRevealedWord(""); // Clear any previously revealed word
      } else {
        setMessage(data.message || "Could not start game.");
        setGameReady(false);
      }
    } catch (err) {
      console.log("Game start error:", err.message);
      setGameReady(false);
    }
  }

  async function getScoresFromBackend() {
    try {
      const response = await fetch(`${API_BASE}/scores`, {
        credentials: "include",
      });
      const data = await response.json();
      setTopScores(data);
    } catch (err) {
      console.log("Scores fetch error:", err.message);
    }
  }

  function triggerShake() {
    setShakeRow(guesses.length);
    setTimeout(() => setShakeRow(-1), 500);
  }

  function checkAchievements(result, attempts, updatedStats) {
    let earned = [];

    if (result === "win" && !achievements.includes("firstWin")) {
      earned.push("firstWin");
    }

    if (result === "win" && attempts <= 3 && !achievements.includes("fastSolver")) {
      earned.push("fastSolver");
    }

    if (updatedStats.streak >= 3 && !achievements.includes("winStreak")) {
      earned.push("winStreak");
    }

    if (updatedStats.gamesPlayed >= 10 && !achievements.includes("persistent")) {
      earned.push("persistent");
    }

    if (earned.length > 0) {
      const updatedAchievements = [...achievements, ...earned];
      setAchievements(updatedAchievements);
      setNewAchievements(earned);
      setAchievementToast(earned[0]);
      return updatedAchievements;
    }

    setNewAchievements([]);
    return achievements;
  }

  function getAchievementInfo(id) {
    return achievementList.find((item) => item.id === id);
  }

  // SECURITY: Hint now comes from server (secret word never on client)
  async function getHint() {
    if (hintUsed) {
      setHintMessage("İpucu hakkını zaten kullandın.");
      return;
    }

    if (!gameReady) {
      setHintMessage("Kelime henüz hazır değil.");
      return;
    }

    try {
      // Send known letters to server so it can pick an unknown one
      const knownLetters = Object.entries(keyboardColors)
        .filter(([, color]) => color === "green" || color === "orange")
        .map(([letter]) => letter);

      const response = await fetch(`${API_BASE}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ knownLetters }),
      });

      const data = await response.json();

      if (data.alreadyUsed) {
        setHintMessage("İpucu hakkını zaten kullandın.");
      } else if (data.letter) {
        setHintMessage(`İpucu: Kelimenin içinde "${data.letter}" harfi var.`);
        setHintUsed(true);
      } else {
        setHintMessage(data.message || "İpucu alınamadı.");
      }
    } catch (err) {
      console.log("Hint error:", err.message);
      setHintMessage("İpucu alınamadı.");
    }
  }

  async function saveScore(attempts) {
    const newScore = {
      name: playerName,
      attempts: attempts,
      result: "Kazandı",
    };

    try {
      const response = await fetch(`${API_BASE}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newScore),
      });

      const data = await response.json();
      setTopScores(data);
    } catch (err) {
      console.log("Score save error:", err.message);
    }
  }

  async function saveStats(result, attempts) {
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

    const updatedAchievements = checkAchievements(result, attempts, updatedStats);

    setStats(updatedStats);
    await savePlayerData(playerName, updatedStats, updatedAchievements);
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

  // SECURITY: Guess evaluation is now done SERVER-SIDE via /check-guess
  async function submitGuess() {
    if (gameOver) return;

    if (!gameReady) {
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

    try {
      // Send guess to server for validation + evaluation
      const response = await fetch(`${API_BASE}/check-guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ guess: word }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Bir hata oluştu.");
        triggerShake();
        return;
      }

      // Word not in dictionary
      if (data.valid === false) {
        setMessage("Bu kelime sözlükte yok.");
        triggerShake();
        return;
      }

      // Server returned evaluation result
      const result = data.result;
      updateKeyboardColors(word, result);

      const newGuesses = [...guesses, { word, result }];
      setGuesses(newGuesses);
      setRevealedRow(newGuesses.length - 1);
      setCurrentGuess("");

      if (data.correct) {
        setMessage("Kazandın!");
        setResultText("Kazandı");
        setRevealedWord(word); // The word they guessed correctly
        setTimerActive(false);
        setTimeout(() => setGameOver(true), 900);
        saveScore(newGuesses.length);
        saveStats("win", newGuesses.length);
      } else if (data.gameOver) {
        setMessage("Kaybettin! Kelime: " + (data.secretWord || "???"));
        setResultText("Kaybetti");
        setRevealedWord(data.secretWord || "???");
        setTimerActive(false);
        setTimeout(() => setGameOver(true), 900);
        saveStats("loss", newGuesses.length);
      } else {
        setMessage("Tekrar dene.");
      }
    } catch (err) {
      console.log("Guess submission error:", err.message);
      setMessage("Tahmin gönderilemedi, tekrar dene.");
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
    startNewGameSession();
    getScoresFromBackend();
    setCurrentGuess("");
    setGuesses([]);
    setMessage("");
    setHintMessage("");
    setHintUsed(false);
    setGameOver(false);
    setResultText("");
    setRevealedWord("");
    setKeyboardColors({});
    setRevealedRow(-1);
    setShakeRow(-1);
    setNameReady(playerName.trim() !== "");
    setNewAchievements([]);
    setTimerActive(playerName.trim() !== "");
    setTimerSeconds(0);
    setAchievementToast(null);
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

  const achievementRate = Math.round(
    (achievements.length / achievementList.length) * 100
  );

  const playerInitial =
    playerName.trim() !== ""
      ? playerName.trim()[0].toLocaleUpperCase("tr-TR")
      : "P";

  const playerXp =
    stats.gamesPlayed * 8 + stats.wins * 20 + achievements.length * 35;

  const playerLevel = Math.floor(playerXp / 100) + 1;
  const currentLevelXp = playerXp % 100;

  return (
    <div className="game" tabIndex={0} onKeyDown={handleKeyDown}>
      {achievementToast && (
        <div className="achievement-toast">
          <span>Achievement Unlocked</span>
          <strong>{getAchievementInfo(achievementToast)?.title}</strong>
          <p>{getAchievementInfo(achievementToast)?.description}</p>
        </div>
      )}

      {showWelcome && (
        <div className="popup-overlay">
          <div className="popup-card welcome-card">
            <h2>Welcome Player</h2>
            <p>Oyuna başlamadan önce oyuncu adını gir.</p>

            <input
              className="welcome-input"
              type="text"
              placeholder="Oyuncu adın"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  startGameWithName();
                }
              }}
              maxLength={30}
              autoFocus
            />

            <button onClick={startGameWithName}>Oyuna Başla</button>
          </div>
        </div>
      )}

      <div className="hero">
        <p className="mini-title">Turkish Wordle</p>
        <h1>WORDLE GAME</h1>
        <p className="subtitle">Kelimeyi 6 denemede bul!</p>

        <div className="timer-box">
          Time: <strong>{formatTime(timerSeconds)}</strong>
        </div>

        <div className="top-buttons">
          <button className="help-button" onClick={() => setShowHelp(true)}>
            Nasıl Oynanır?
          </button>

          <button
            className="stats-button"
            onClick={() => setShowStatsPopup(true)}
          >
            Statistics
          </button>
        </div>
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

      {showStatsPopup && (
        <div className="popup-overlay">
          <div className="popup-card statistics-card">
            <h2>Statistics</h2>

            <div className="statistics-grid">
              <div>
                <span>Games Played</span>
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
                <span>Current Streak</span>
                <strong>{stats.streak}</strong>
              </div>

              <div>
                <span>Best Score</span>
                <strong>{stats.bestScore}</strong>
              </div>

              <div>
                <span>Achievements</span>
                <strong>
                  {achievements.length}/{achievementList.length}
                </strong>
              </div>

              <div>
                <span>Achievement Rate</span>
                <strong>%{achievementRate}</strong>
              </div>

              <div className="wide-stat">
                <span>Current Timer</span>
                <strong>{formatTime(timerSeconds)}</strong>
              </div>
            </div>

            <button onClick={() => setShowStatsPopup(false)}>Close</button>
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

      {playerName && !showWelcome && (
        <div className="player-profile-card">
          <div className="profile-avatar">{playerInitial}</div>

          <div className="profile-info">
            <span>Player Profile</span>
            <h3>{playerName}</h3>

            <div className="xp-area">
              <div className="xp-top">
                <small>Level {playerLevel}</small>
                <small>{currentLevelXp}/100 XP</small>
              </div>

              <div className="xp-bar">
                <div style={{ width: `${currentLevelXp}%` }}></div>
              </div>
            </div>
          </div>

          <div className="profile-mini-stats">
            <p>
              Games <strong>{stats.gamesPlayed}</strong>
            </p>
            <p>
              Win Rate <strong>%{winRate}</strong>
            </p>
            <p>
              Badges{" "}
              <strong>
                {achievements.length}/{achievementList.length}
              </strong>
            </p>
          </div>

          <button className="change-player-button" onClick={changePlayer}>
            Change
          </button>
        </div>
      )}

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
                  Süre: <strong>{formatTime(timerSeconds)}</strong>
                </p>
                <p>
                  Kelime: <strong>{revealedWord}</strong>
                </p>
              </>
            ) : (
              <>
                <div className="popup-icon lose-icon">X</div>
                <h2>Better luck next time!</h2>
                <p>
                  Süre: <strong>{formatTime(timerSeconds)}</strong>
                </p>
                <p>Doğru kelime:</p>
                <h3>{revealedWord}</h3>
              </>
            )}

            {newAchievements.length > 0 && (
              <div className="new-achievement-box">
                <h3>Yeni Başarı Kazandın!</h3>
                {newAchievements.map((achievementId) => {
                  const achievement = getAchievementInfo(achievementId);

                  return (
                    <p key={achievementId}>
                      <strong>{achievement.title}</strong> -{" "}
                      {achievement.description}
                    </p>
                  );
                })}
              </div>
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

                  {rowIndex === guesses.length &&
                    letterIndex === currentGuess.length &&
                    !gameOver &&
                    nameReady &&
                    currentGuess.length < 5 && (
                      <span className="typing-cursor"></span>
                    )}
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

      <div className="bottom-panels">
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

        <div className="achievements-panel">
          <h2>Achievements</h2>

          {achievements.length === 0 ? (
            <p>Henüz başarı rozeti yok.</p>
          ) : (
            achievements.map((achievementId) => {
              const achievement = getAchievementInfo(achievementId);

              return (
                <div key={achievementId} className="achievement-item">
                  <strong>{achievement.title}</strong>
                  <span>{achievement.description}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <footer className="footer">
        <p>Made by İncilay Kurtuluş</p>
        <span>Computer Engineering • Full-Stack Wordle Project</span>
      </footer>
    </div>
  );
}

export default App;
