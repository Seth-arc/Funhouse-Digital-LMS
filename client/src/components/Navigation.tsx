import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './Navigation.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

interface ReminderResponse {
  count?: number;
  reminders?: unknown[];
}

const Navigation: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [reminderCount, setReminderCount] = useState(0);

  const handleViewSwitch = (view: string) => {
    navigate(`/${view}`);
  };

  useEffect(() => {
    if (!user || (user.role !== 'tutor' && user.role !== 'teacher' && user.role !== 'parent')) {
      setReminderCount(0);
      return;
    }

    let isActive = true;
    let intervalId: number | undefined;

    const fetchReminders = async () => {
      try {
        const response = await axios.get<ReminderResponse>(`${API_URL}/notifications/reminders`, {
          params: {
            days: 7,
            limit: 50,
          },
        });
        const rawCount =
          typeof response.data?.count === 'number'
            ? response.data.count
            : Array.isArray(response.data?.reminders)
              ? response.data.reminders.length
              : 0;
        const safeCount = Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : 0;
        if (isActive) {
          setReminderCount(safeCount);
        }
      } catch {
        if (isActive) {
          setReminderCount(0);
        }
      }
    };

    void fetchReminders();
    if (typeof window !== 'undefined') {
      intervalId = window.setInterval(() => {
        void fetchReminders();
      }, 60_000);
    }

    return () => {
      isActive = false;
      if (intervalId !== undefined && typeof window !== 'undefined') {
        window.clearInterval(intervalId);
      }
    };
  }, [user?.id, user?.role]);

  if (!user) return null;

  const reminderLabel = reminderCount > 99 ? '99+' : String(reminderCount);

  return (
    <nav className="main-navigation">
      <div className="nav-brand">
        <span className="nav-wordmark" aria-label="Funhouse Digital">
          <span className="nav-wordmark__main">Funhouse</span>
          <span className="nav-wordmark__accent">Digital</span>
        </span>
      </div>
      <div className="nav-links">
        {user.role === 'tutor' && (
          <>
            <button onClick={() => handleViewSwitch('tutor')} className="nav-link nav-link-with-badge">
              <span>Tutor Dashboard</span>
              {reminderCount > 0 && (
                <span className="nav-reminder-badge" aria-label={`${reminderCount} upcoming reminders`} title={`${reminderCount} upcoming reminders`}>
                  {reminderLabel}
                </span>
              )}
            </button>
            <button onClick={() => handleViewSwitch('tutor/feedback')} className="nav-link">
              Feedback Inbox
            </button>
          </>
        )}
        {user.role === 'teacher' && (
          <button onClick={() => handleViewSwitch('teacher')} className="nav-link nav-link-with-badge">
            <span>Teacher Dashboard</span>
            {reminderCount > 0 && (
              <span className="nav-reminder-badge" aria-label={`${reminderCount} upcoming reminders`} title={`${reminderCount} upcoming reminders`}>
                {reminderLabel}
              </span>
            )}
          </button>
        )}
        {user.role === 'parent' && (
          <button onClick={() => handleViewSwitch('parent')} className="nav-link nav-link-with-badge">
            <span>Parent Dashboard</span>
            {reminderCount > 0 && (
              <span className="nav-reminder-badge" aria-label={`${reminderCount} upcoming reminders`} title={`${reminderCount} upcoming reminders`}>
                {reminderLabel}
              </span>
            )}
          </button>
        )}
        <button onClick={logout} className="nav-link nav-link-logout">
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
