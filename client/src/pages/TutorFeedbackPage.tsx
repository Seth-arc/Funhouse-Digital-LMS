import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';
import './TutorFeedbackPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

interface FeedbackEntry {
  id: string;
  user_id: string | null;
  student_id: string | null;
  role: string;
  category: string | null;
  message: string;
  page_path: string | null;
  metadata: unknown;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  user_name?: string | null;
  user_email?: string | null;
  student_name?: string | null;
  resolved_by_name?: string | null;
}

const STATUS_FILTERS = ['all', 'new', 'resolved'] as const;

const formatDateTime = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleString();
};

const toDisplayText = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const TutorFeedbackPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');

  const fetchFeedback = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const params: Record<string, string | number> = { limit: 200 };
        if (statusFilter !== 'all') {
          params.status = statusFilter;
        }

        const response = await axios.get<FeedbackEntry[]>(`${API_URL}/feedback`, { params });
        const data = Array.isArray(response.data) ? response.data : [];
        setFeedback(data);
      } catch (fetchError: any) {
        setError(fetchError?.response?.data?.error || 'Failed to load feedback.');
      } finally {
        if (showSpinner) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    if (authLoading || !user) return;
    void fetchFeedback(true);
  }, [authLoading, fetchFeedback, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    const refreshTimer = window.setInterval(() => {
      void fetchFeedback(false);
    }, 30_000);

    return () => window.clearInterval(refreshTimer);
  }, [authLoading, fetchFeedback, user]);

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        feedback
          .map((entry) => entry.category || '')
          .filter((category) => category.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ['all', ...categories];
  }, [feedback]);

  const roleOptions = useMemo(() => {
    const roles = Array.from(
      new Set(
        feedback
          .map((entry) => entry.role || '')
          .filter((role) => role.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ['all', ...roles];
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return feedback
      .filter((entry) => categoryFilter === 'all' || entry.category === categoryFilter)
      .filter((entry) => roleFilter === 'all' || entry.role === roleFilter)
      .filter((entry) => {
        if (!query) return true;
        const haystack = [
          entry.message,
          entry.category || '',
          entry.role,
          entry.user_name || '',
          entry.user_email || '',
          entry.student_name || '',
          entry.page_path || '',
          toDisplayText(entry.metadata),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [categoryFilter, feedback, roleFilter, searchText]);

  const getStatusTone = (status: string): 'new' | 'resolved' | 'reviewing' | 'default' => {
    if (status === 'new' || status === 'resolved' || status === 'reviewing') {
      return status;
    }
    return 'default';
  };

  const summary = useMemo(() => {
    const total = feedback.length;
    const open = feedback.filter((entry) => entry.status === 'new').length;
    const resolved = feedback.filter((entry) => entry.status === 'resolved').length;
    return { total, open, resolved };
  }, [feedback]);

  return (
    <div className="dashboard">
      <Navigation />

      <header className="dashboard-header">
        <div>
          <h1>Feedback Inbox</h1>
          <p>Review learner and staff feedback in one organized queue.</p>
        </div>
        <div className="header-actions">
          <span>{user?.name}</span>
        </div>
      </header>

      <main className="dashboard-main feedback-page-main">
        <section className="feedback-summary-grid">
          <article className="card feedback-summary-card">
            <h2>Total</h2>
            <strong>{summary.total}</strong>
          </article>
          <article className="card feedback-summary-card">
            <h2>New</h2>
            <strong>{summary.open}</strong>
          </article>
          <article className="card feedback-summary-card">
            <h2>Resolved</h2>
            <strong>{summary.resolved}</strong>
          </article>
        </section>

        <section className="card feedback-toolbar">
          <div className="feedback-toolbar-group">
            <label htmlFor="feedback-status-filter">Status</label>
            <select
              id="feedback-status-filter"
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as (typeof STATUS_FILTERS)[number])}
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="feedback-toolbar-group">
            <label htmlFor="feedback-category-filter">Category</label>
            <select
              id="feedback-category-filter"
              className="input"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </select>
          </div>

          <div className="feedback-toolbar-group">
            <label htmlFor="feedback-role-filter">Role</label>
            <select
              id="feedback-role-filter"
              className="input"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role === 'all' ? 'All roles' : role}
                </option>
              ))}
            </select>
          </div>

          <div className="feedback-toolbar-group feedback-toolbar-group--search">
            <label htmlFor="feedback-search">Search</label>
            <input
              id="feedback-search"
              type="search"
              className="input"
              placeholder="Message, user, category, route..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="feedback-toolbar-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void fetchFeedback(false)} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </section>

        <section className="card feedback-inbox-card">
          <div className="feedback-inbox-head">
            <h2>Latest feedback</h2>
            <span>
              Showing {filteredFeedback.length} of {feedback.length}
            </span>
          </div>

          {loading ? (
            <div className="loading">Loading feedback...</div>
          ) : error ? (
            <div className="feedback-error" role="alert">
              {error}
            </div>
          ) : filteredFeedback.length === 0 ? (
            <div className="empty-state">
              <p>No feedback matches your current filters.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table feedback-table">
                <thead>
                  <tr>
                    <th scope="col">Submitted</th>
                    <th scope="col">User</th>
                    <th scope="col">Role</th>
                    <th scope="col">Category</th>
                    <th scope="col">Message</th>
                    <th scope="col">Page</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.map((entry) => (
                    <tr key={entry.id}>
                      <td className="feedback-date">{formatDateTime(entry.created_at)}</td>
                      <td>
                        <div className="feedback-user">
                          <strong>{entry.user_name || entry.student_name || 'Unknown user'}</strong>
                          {(entry.user_email || entry.student_name) && (
                            <span>{entry.user_email || entry.student_name}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-primary">{entry.role}</span>
                      </td>
                      <td>{entry.category || '-'}</td>
                      <td>
                        <div className="feedback-message">
                          <p>{entry.message}</p>
                          {entry.metadata !== null && entry.metadata !== undefined && (
                            <small>meta: {toDisplayText(entry.metadata)}</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <code className="feedback-page-path">{entry.page_path || '-'}</code>
                      </td>
                      <td>
                        <span className={`feedback-status-pill feedback-status-pill--${getStatusTone(entry.status)}`}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default TutorFeedbackPage;
