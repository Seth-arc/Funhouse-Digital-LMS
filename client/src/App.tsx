import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import TutorDashboard from './pages/TutorDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import ParentDashboard from './pages/ParentDashboard';
import LearnerDashboard from './pages/LearnerDashboard';
import PrivateRoute from './components/PrivateRoute';
import SplashScreen from './components/SplashScreen';
import FeedbackWidget from './components/FeedbackWidget';
import { flushOfflineQueue, getOfflineQueueSize, onOfflineQueueChange } from './network';
import './App.css';

interface NetworkStatusBannerProps {
  isOnline: boolean;
  queuedRequestCount: number;
  isQueueSyncing: boolean;
  splashComplete: boolean;
}

const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  isOnline,
  queuedRequestCount,
  isQueueSyncing,
  splashComplete,
}) => {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login' || location.pathname === '/';
  const shouldShow = !isLoginRoute && splashComplete && (!isOnline || queuedRequestCount > 0);

  if (!shouldShow) return null;

  const onlineBannerText = isQueueSyncing
    ? `Syncing ${queuedRequestCount} queued action${queuedRequestCount === 1 ? '' : 's'}...`
    : `${queuedRequestCount} queued action${queuedRequestCount === 1 ? '' : 's'} pending sync.`;

  return (
    <div className={`network-banner ${isOnline ? 'network-banner--syncing' : 'network-banner--offline'}`} role="status">
      {!isOnline
        ? `You are offline. ${queuedRequestCount} action${queuedRequestCount === 1 ? '' : 's'} queued for sync.`
        : onlineBannerText}
    </div>
  );
};

function App() {
  const [splashComplete, setSplashComplete] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queuedRequestCount, setQueuedRequestCount] = useState(() => getOfflineQueueSize());
  const [isQueueSyncing, setIsQueueSyncing] = useState(false);
  const queueSyncInFlightRef = useRef(false);

  const syncQueue = useCallback(async () => {
    if (queueSyncInFlightRef.current) return;

    queueSyncInFlightRef.current = true;
    setIsQueueSyncing(true);
    try {
      await flushOfflineQueue();
    } finally {
      setQueuedRequestCount(getOfflineQueueSize());
      setIsQueueSyncing(false);
      queueSyncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      void syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const stopQueueListener = onOfflineQueueChange((count) => setQueuedRequestCount(count));
    void syncQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopQueueListener();
    };
  }, [syncQueue]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOnline || queuedRequestCount === 0) return;

    const retryIntervalId = window.setInterval(() => {
      void syncQueue();
    }, 5000);

    return () => window.clearInterval(retryIntervalId);
  }, [isOnline, queuedRequestCount, syncQueue]);

  return (
    <AuthProvider>
      <div className="app">
        <Router>
          <NetworkStatusBanner
            isOnline={isOnline}
            queuedRequestCount={queuedRequestCount}
            isQueueSyncing={isQueueSyncing}
            splashComplete={splashComplete}
          />
          {!splashComplete && <SplashScreen onComplete={() => setSplashComplete(true)} />}
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/tutor"
              element={
                <PrivateRoute requiredRole="tutor">
                  <TutorDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <PrivateRoute requiredRole="teacher" allowTutor={true}>
                  <TeacherDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/parent"
              element={
                <PrivateRoute requiredRole="parent" allowTutor={true}>
                  <ParentDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/learner/:studentId"
              element={<LearnerDashboard />}
            />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
          <FeedbackWidget />
        </Router>
      </div>
    </AuthProvider>
  );
}

export default App;
