import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { postWithOfflineQueue, PostAuthMode } from '../network';
import { trackEvent } from '../analytics';
import './FeedbackWidget.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const FEEDBACK_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'bug', label: 'Bug report' },
  { value: 'idea', label: 'Feature idea' },
  { value: 'ux', label: 'UX issue' },
];

const getAuthMode = (): PostAuthMode => {
  if (typeof window === 'undefined') return 'none';
  if (localStorage.getItem('token')) return 'staff';
  if (localStorage.getItem('learner_token')) return 'learner';
  return 'none';
};

const FeedbackWidget: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusVariant, setStatusVariant] = useState<'success' | 'error'>('success');

  const authMode = getAuthMode();
  const isAuthenticated = authMode !== 'none';
  const hiddenForRoute = location.pathname === '/login' || location.pathname === '/';

  const charCount = useMemo(() => message.trim().length, [message]);

  if (!isAuthenticated || hiddenForRoute) {
    return null;
  }

  const closeWidget = () => {
    setOpen(false);
    setStatusMessage('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();

    if (trimmedMessage.length < 5) {
      setStatusVariant('error');
      setStatusMessage('Please write at least 5 characters.');
      return;
    }

    setSubmitting(true);
    setStatusMessage('');

    try {
      const result = await postWithOfflineQueue(
        `${API_URL}/feedback`,
        {
          category,
          message: trimmedMessage,
          page_path: location.pathname,
          metadata: {
            source: 'feedback_widget',
          },
        },
        { authMode }
      );

      await trackEvent(
        'feedback.submit',
        {
          category,
          queued: result.queued,
        },
        { authMode }
      );

      setStatusVariant('success');
      setStatusMessage(
        result.queued
          ? 'You are offline. Feedback was queued and will send automatically.'
          : 'Thanks! Your feedback was submitted.'
      );
      setMessage('');
      if (!result.queued) {
        setOpen(false);
      }
    } catch (error: any) {
      setStatusVariant('error');
      setStatusMessage(error?.response?.data?.error || 'Could not submit feedback right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {statusMessage && !open && (
        <div className={`feedback-toast feedback-toast--${statusVariant}`} role="status">
          {statusMessage}
        </div>
      )}

      <button
        type="button"
        className="feedback-fab btn btn-primary"
        onClick={() => {
          setOpen(true);
          setStatusMessage('');
        }}
        aria-label="Open feedback form"
      >
        Feedback
      </button>

      {open && (
        <div className="feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <div className="feedback-card">
            <div className="feedback-header">
              <h2 id="feedback-title">Share Feedback</h2>
              <button type="button" className="close" onClick={closeWidget} aria-label="Close feedback form">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="feedback-form" noValidate>
              <div className="form-group">
                <label htmlFor="feedback-category">Category</label>
                <select
                  id="feedback-category"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {FEEDBACK_CATEGORIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="feedback-message">What should we improve?</label>
                <textarea
                  id="feedback-message"
                  className="input feedback-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what happened and what would help..."
                  maxLength={2000}
                  required
                />
                <p className="feedback-meta">{charCount}/2000</p>
              </div>

              {statusMessage && (
                <p className={`feedback-status feedback-status--${statusVariant}`} role="status">
                  {statusMessage}
                </p>
              )}

              <div className="feedback-actions">
                <button type="button" className="btn btn-secondary" onClick={closeWidget}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
