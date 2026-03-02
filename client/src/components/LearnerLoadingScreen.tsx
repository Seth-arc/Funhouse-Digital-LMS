import React, { useEffect, useState } from 'react';
import './LearnerLoadingScreen.css';

interface LearnerLoadingScreenProps {
    isLoadingData: boolean;
    onReady: () => void;
}

const LearnerLoadingScreen: React.FC<LearnerLoadingScreenProps> = ({ isLoadingData, onReady }) => {
    const [minTimePassed, setMinTimePassed] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        // Guarantee this fun screen shows for at least 2.2 seconds
        const timer = setTimeout(() => {
            setMinTimePassed(true);
        }, 2200);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (minTimePassed && !isLoadingData) {
            // Trigger the exit animation
            setIsLeaving(true);
            const exitTimer = setTimeout(() => {
                onReady();
            }, 500); // 500ms wait for the flip-up animation to complete
            return () => clearTimeout(exitTimer);
        }
    }, [minTimePassed, isLoadingData, onReady]);

    return (
        <div className={`learner-splash-root ${isLeaving ? 'learner-splash-leaving' : ''}`}>
            <div className="learner-splash-content">
                <div className="emoji-bouncer">
                    <div className="emoji-orb orb-1">👾</div>
                    <div className="emoji-orb orb-2">🧩</div>
                    <div className="emoji-orb orb-3">🚀</div>
                </div>
                <h1 className="learner-splash-wordmark">
                    <span className="learner-splash-wordmark__main">Funhouse</span>
                    <span className="learner-splash-wordmark__accent">Digital</span>
                </h1>
                <div className="learner-splash-track">
                    <div className="learner-splash-fill"></div>
                </div>
            </div>
        </div>
    );
};

export default LearnerLoadingScreen;
