import React, { useState, useEffect } from 'react';
import './GamePlayer.css';

interface GamePlayerProps {
  game: {
    id: string;
    title: string;
    description?: string;
    category: string;
    game_url?: string;
    instructions?: string;
  };
  onComplete: (score: number, timeSpent: number) => void;
  onClose: () => void;
}

const GamePlayer: React.FC<GamePlayerProps> = ({ game, onComplete, onClose }) => {
  const [score, setScore] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeSpent(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleStart = () => {
    setGameStarted(true);
    setIsPlaying(true);
  };

  const handleComplete = () => {
    setIsPlaying(false);
    // Simulate scoring based on time and category
    const finalScore = Math.min(100, Math.floor(70 + Math.random() * 30));
    setScore(finalScore);
    onComplete(finalScore, timeSpent);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="game-player-overlay">
      <div className="game-player-container">
        <div className="game-player-header">
          <div>
            <h2>{game.title}</h2>
            <p className="game-category">{game.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
          <button className="close-game-btn" onClick={onClose}>✕</button>
        </div>

        {!gameStarted ? (
          <div className="game-start-screen">
            <div className="game-instructions">
              <h3>Instructions</h3>
              {game.instructions ? (
                <p>{game.instructions}</p>
              ) : (
                <p>
                  {game.category === 'computational_thinking' && 
                    'Use logical thinking to solve puzzles and complete challenges. Think step by step!'}
                  {game.category === 'typing' && 
                    'Type accurately and quickly. Focus on proper finger placement and speed!'}
                  {game.category === 'purposeful_gaming' && 
                    'Have fun while learning! Complete the activities and earn points!'}
                </p>
              )}
              {game.description && (
                <div className="game-description">
                  <p>{game.description}</p>
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-large" onClick={handleStart}>
              Start Game 🎮
            </button>
          </div>
        ) : (
          <div className="game-play-area">
            {game.game_url ? (
              <iframe 
                src={game.game_url} 
                className="game-iframe"
                title={game.title}
                allowFullScreen
              />
            ) : (
              <div className="game-simulation">
                <div className="game-content">
                  <div className="game-stats">
                    <div className="stat-item">
                      <span className="stat-label">Score</span>
                      <span className="stat-value">{score}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Time</span>
                      <span className="stat-value">{formatTime(timeSpent)}</span>
                    </div>
                  </div>
                  
                  <div className="game-area">
                    {game.category === 'computational_thinking' && (
                      <div className="computational-game">
                        <h3>Pattern Recognition Challenge</h3>
                        <div className="pattern-example">
                          <div className="pattern-item">🔵</div>
                          <div className="pattern-item">🔴</div>
                          <div className="pattern-item">🔵</div>
                          <div className="pattern-item">🔴</div>
                          <div className="pattern-item">?</div>
                        </div>
                        <p>What comes next in the pattern?</p>
                        <div className="answer-options">
                          <button className="answer-btn" onClick={() => setScore(prev => Math.min(100, prev + 10))}>🔵</button>
                          <button className="answer-btn" onClick={() => setScore(prev => Math.min(100, prev + 10))}>🔴</button>
                          <button className="answer-btn" onClick={() => setScore(prev => Math.min(100, prev + 10))}>🟢</button>
                        </div>
                      </div>
                    )}
                    
                    {game.category === 'typing' && (
                      <div className="typing-game">
                        <h3>Typing Challenge</h3>
                        <div className="typing-text">
                          <p>The quick brown fox jumps over the lazy dog.</p>
                        </div>
                        <textarea 
                          className="typing-input"
                          placeholder="Type the text above..."
                          rows={3}
                          onChange={(e) => {
                            if (e.target.value.length > 0 && score === 0) {
                              setScore(10);
                            }
                            if (e.target.value.length > 20) {
                              setScore(prev => Math.min(100, prev + 5));
                            }
                          }}
                        />
                        <p className="typing-hint">Type as fast and accurately as you can!</p>
                      </div>
                    )}
                    
                    {game.category === 'purposeful_gaming' && (
                      <div className="purposeful-game">
                        <h3>Learning Adventure</h3>
                        <div className="adventure-content">
                          <div className="adventure-scene">
                            <p>🌟 You're on a learning adventure! 🌟</p>
                            <p>Complete challenges to earn points and unlock new levels!</p>
                          </div>
                          <div className="challenge-buttons">
                            <button 
                              className="challenge-btn"
                              onClick={() => setScore(prev => Math.min(100, prev + 15))}
                            >
                              Complete Challenge 1 ✅
                            </button>
                            <button 
                              className="challenge-btn"
                              onClick={() => setScore(prev => Math.min(100, prev + 15))}
                            >
                              Complete Challenge 2 ✅
                            </button>
                            <button 
                              className="challenge-btn"
                              onClick={() => setScore(prev => Math.min(100, prev + 15))}
                            >
                              Complete Challenge 3 ✅
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="game-controls">
              <button 
                className="btn btn-success btn-large" 
                onClick={handleComplete}
                disabled={score < 50}
              >
                Complete Game ✓
              </button>
              <p className="completion-hint">
                {score < 50 ? `Keep playing! Score: ${score}/100` : 'Great job! You can complete the game now.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePlayer;
