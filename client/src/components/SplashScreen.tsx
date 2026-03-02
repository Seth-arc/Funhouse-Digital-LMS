import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [leaving, setLeaving] = useState(false);
  const [showArrow, setShowArrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Show arrow after the initial animation completes
    const arrowTimer = window.setTimeout(() => setShowArrow(true), 2000);
    return () => window.clearTimeout(arrowTimer);
  }, []);

  const handleContinue = () => {
    if (leaving || !showArrow) return;
    setLeaving(true);
    window.setTimeout(() => onComplete(), 700);
  };

  return (
    <div className={`splash-root${leaving ? ' splash-leaving' : ''}`}>
      <div className="splash-glow splash-glow--top" />
      <div className="splash-glow splash-glow--bottom" />

      <div className="splash-inner">
        {/* Brand name */}
        <h1 className="splash-wordmark">
          <span className="splash-word splash-word--1">Funhouse</span>
          <span className="splash-word splash-word--2">Digital</span>
        </h1>

        <p className="splash-tagline">A platform for learning through play</p>
      </div>

      <div className={`splash-continue${showArrow ? ' splash-continue--visible' : ''}`}>
        <button onClick={handleContinue} className="splash-arrow-btn" aria-label="Continue to login">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      {/* Progress bar at bottom */}
      <div className={`splash-bar-track${showArrow ? ' splash-bar--hidden' : ''}`}>
        <div className="splash-bar-fill" />
      </div>
    </div>
  );
};

export default SplashScreen;
