import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import Navigation from '../components/Navigation';
import OnboardingModal from '../components/OnboardingModal';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const PARENT_ONBOARDING_KEY = 'fd_onboarding_parent_v1';

interface Student {
  id: string;
  name: string;
  grade: number;
  age: number;
  tutor_name?: string;
  tutor_email?: string;
  tutor_id?: string;
}

interface Progress {
  id: string;
  game_title: string;
  category: string;
  score: number;
  completed: boolean;
  attempts: number;
  created_at: string;
}

interface Stats {
  category: string;
  total_games: number;
  completed_games: number;
  avg_score: number;
  total_time_spent: number;
}

interface TutorNote {
  id: string;
  student_id: string;
  tutor_id: string;
  tutor_name?: string;
  note: string;
  session_date: string;
  created_at: string;
  updated_at: string;
}

interface SessionEntry {
  id: string;
  student_id: string;
  tutor_id: string;
  tutor_name?: string;
  lesson_id?: string;
  lesson_title?: string;
  title?: string;
  session_date: string;
  start_time: string;
  end_time?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  parent_confirmed?: number;
}

interface ConsentRecord {
  student_id: string;
  parent_consent: number;
  tutor_consent: number;
  parent_consented_at: string | null;
  tutor_consented_at: string | null;
  can_proceed: boolean;
}

const ParentDashboard: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const [showOnboardingTip, setShowOnboardingTip] = useState(() => localStorage.getItem(PARENT_ONBOARDING_KEY) !== 'dismissed');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [progress, setProgress] = useState<Progress[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<TutorNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [studentDetail, setStudentDetail] = useState<Student | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentMessage, setConsentMessage] = useState('');
  const [exportingData, setExportingData] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    if (authLoading) return;
    fetchStudents();
  }, [authLoading]);

  useEffect(() => {
    if (selectedStudent) {
      fetchProgress(selectedStudent);
      fetchStats(selectedStudent);
      fetchNotes(selectedStudent);
      fetchSessions(selectedStudent);
      fetchStudentDetail(selectedStudent);
      fetchConsent(selectedStudent);
      setConsentMessage('');
      setExportMessage('');
    }
  }, [selectedStudent]);

  const fetchStudentDetail = async (studentId: string) => {
    try {
      const res = await axios.get(`${API_URL}/students/${studentId}`);
      setStudentDetail(res.data);
    } catch (error) {
      console.error('Error fetching student detail:', error);
    }
  };

  const handleConfirmSession = async (sessionId: string) => {
    setConfirmingId(sessionId);
    try {
      await axios.put(`${API_URL}/schedule/${sessionId}/confirm`);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, parent_confirmed: 1 } : s));
    } catch (error) {
      console.error('Error confirming session:', error);
    } finally {
      setConfirmingId(null);
    }
  };

  const fetchSessions = async (studentId: string) => {
    setSessionsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/schedule/student/${studentId}`);
      setSessions(res.data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchNotes = async (studentId: string) => {
    setNotesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/notes/student/${studentId}`);
      setNotes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await axios.get(`${API_URL}/students`);
      const data = Array.isArray(response.data) ? response.data : [];
      setStudents(data);
      if (data.length > 0) {
        setSelectedStudent(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async (studentId: string) => {
    try {
      const response = await axios.get(`${API_URL}/progress/student/${studentId}`);
      setProgress(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching progress:', error);
      setProgress([]);
    }
  };

  const fetchStats = async (studentId: string) => {
    try {
      const response = await axios.get(`${API_URL}/progress/stats/${studentId}`);
      setStats(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats([]);
    }
  };

  const fetchConsent = async (studentId: string) => {
    setConsentLoading(true);
    try {
      const response = await axios.get(`${API_URL}/consent/${studentId}`);
      setConsent(response.data || null);
    } catch (error: any) {
      console.error('Error fetching consent:', error);
      setConsent(null);
    } finally {
      setConsentLoading(false);
    }
  };

  const handleConsentToggle = async (checked: boolean) => {
    if (!selectedStudent) return;
    setSavingConsent(true);
    setConsentMessage('');
    try {
      const response = await axios.put(`${API_URL}/consent/${selectedStudent}`, {
        consent: checked,
      });
      setConsent(response.data || null);
      setConsentMessage(checked ? 'Consent granted successfully.' : 'Consent withdrawn successfully.');
    } catch (error: any) {
      console.error('Error updating consent:', error);
      setConsentMessage(error.response?.data?.error || 'Failed to update consent.');
    } finally {
      setSavingConsent(false);
    }
  };

  const handleExportRequest = async () => {
    if (!selectedStudent || !currentStudent) return;
    setExportingData(true);
    setExportMessage('');
    try {
      const response = await axios.get(`${API_URL}/privacy/export/${selectedStudent}`);
      const payload = response.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const exportDate = new Date().toISOString().slice(0, 10);
      const safeName = currentStudent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName || 'student'}-data-export-${exportDate}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage('Data export generated and downloaded.');
    } catch (error: any) {
      console.error('Error exporting student data:', error);
      setExportMessage(error.response?.data?.error || 'Failed to export student data.');
    } finally {
      setExportingData(false);
    }
  };

  const currentStudent = students.find(s => s.id === selectedStudent);
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingUnconfirmedCount = sessions.filter(
    s => s.status === 'scheduled' && s.parent_confirmed !== 1 && s.session_date >= todayStr
  ).length;
  const completedGamesCount = progress.filter(p => p.completed).length;
  const parentTodayActions = [
    {
      key: 'confirm',
      title:
        upcomingUnconfirmedCount > 0
          ? `${upcomingUnconfirmedCount} session${upcomingUnconfirmedCount !== 1 ? 's' : ''} awaiting confirmation`
          : 'All upcoming sessions confirmed',
      description: 'Confirm upcoming sessions so your tutor knows plans are locked in.',
      cta: 'Open sessions',
      onClick: () => setActiveSection('sessions'),
    },
    {
      key: 'progress',
      title:
        completedGamesCount > 0
          ? `${completedGamesCount} game session${completedGamesCount !== 1 ? 's' : ''} completed`
          : 'No completed games yet',
      description: 'Review your child latest game activity and scores.',
      cta: 'View progress',
      onClick: () => setActiveSection('progress'),
    },
    {
      key: 'tips',
      title: notes.length > 0 ? 'New tutor notes available' : 'At-home support tips ready',
      description: 'Read tutor updates, then use home tips to reinforce learning.',
      cta: notes.length > 0 ? 'Open notes' : 'Open tips',
      onClick: () => setActiveSection(notes.length > 0 ? 'notes' : 'tips'),
    },
  ];

  const dismissOnboardingTip = () => {
    localStorage.setItem(PARENT_ONBOARDING_KEY, 'dismissed');
    setShowOnboardingTip(false);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard">
      <Navigation />
      <header className="dashboard-header">
        <div>
          <h1>Your child’s progress</h1>
          <p>
            See which games they’ve played, scores by category, and how much they’ve completed. Use the tips below to support digital literacy at home.
          </p>
        </div>
        <div className="header-actions">
          <span>{user?.name}</span>
        </div>
      </header>

      <div className="dashboard-layout">
        <nav className="dashboard-sidebar">
          <div className="dashboard-sidebar-label">Navigation</div>
          {[
            { id: 'overview',  label: 'Overview'  },
            { id: 'progress',  label: 'Progress'  },
            { id: 'sessions',  label: 'Sessions'  },
            { id: 'notes',     label: 'Notes'     },
            { id: 'privacy',   label: 'Consent & Privacy' },
            { id: 'tips',      label: 'Tips'      },
          ].map(item => (
            <button
              key={item.id}
              className={`dashboard-sidebar-item${activeSection === item.id ? ' active' : ''}`}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="dashboard-main">
        {students.length === 0 ? (
          <div className="card demo-banner" style={{ padding: 'var(--spacing-2xl)' }}>
            <div className="empty-state">
              <p><strong>No children linked to your account.</strong></p>
              <p style={{ marginTop: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                In a real setup, your school or tutor links your parent account to your child’s profile. To try this view with sample data, log in as <strong>Tutor</strong>, run &quot;Load Sample Data&quot;, then log in as Parent (e.g. parent1@lms.com / parent123) to see one linked child’s progress.
              </p>
              <div className="empty-state-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={fetchStudents}>
                  Refresh Students
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="card today-panel" aria-label="Today actions for Parent">
              <div className="today-panel-header">
                <h2>Today for Parent</h2>
                <p>Three quick actions to stay aligned with your child learning plan.</p>
              </div>
              <div className="today-actions">
                {parentTodayActions.map(action => (
                  <article key={action.key} className="today-action">
                    <h3>{action.title}</h3>
                    <p>{action.description}</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={action.onClick}>
                      {action.cta}
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <OnboardingModal
              isOpen={showOnboardingTip}
              role="parent"
              onComplete={dismissOnboardingTip}
            />

            <div className="card" style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-sm) var(--spacing-lg)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>Child:</span>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              >
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name} - Grade {student.grade} (Age {student.age})
                  </option>
                ))}
              </select>
            </div>

            {currentStudent && (
              <>
                {activeSection === 'overview' && (<>
                {/* ── Tutor contact card ── */}
                {studentDetail?.tutor_name && (
                  <div className="card" style={{ marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)', padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                    <div style={{ fontSize: '2rem', flexShrink: 0 }}>👩‍🏫</div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Your tutor</p>
                      <p style={{ margin: 0, fontWeight: 'var(--font-weight-medium)' }}>{studentDetail.tutor_name}</p>
                      {studentDetail.tutor_email && (
                        <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                          <a href={`mailto:${studentDetail.tutor_email}`} style={{ color: 'var(--color-primary)' }}>{studentDetail.tutor_email}</a>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="card demo-banner" style={{ marginBottom: 'var(--spacing-xl)' }}>
                  <h3 style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>At a glance</h3>
                  <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
                    {progress.length === 0 ? (
                      <>{currentStudent.name} (Grade {currentStudent.grade}) hasn’t completed any games yet. Once they start playing from their learner dashboard, sessions and scores will show here.</>
                    ) : (
                      <>
                        <strong>{currentStudent.name}</strong> (Grade {currentStudent.grade}) has completed <strong>{progress.filter(p => p.completed).length} game session{progress.filter(p => p.completed).length !== 1 ? 's' : ''}</strong>
                        {stats.length > 0 && <> with an average score of <strong>{Math.round(stats.reduce((a, s) => a + (s.avg_score || 0), 0) / stats.length)}%</strong> across categories</>}. Latest activity: {new Date(progress[0].created_at).toLocaleDateString()}.
                      </>
                    )}
                  </p>
                </div>
                <div className="stats-grid">
                  {stats.length > 0 ? stats.map(stat => (
                    <div key={stat.category} className="stat-card">
                      <h3>{stat.completed_games}/{stat.total_games}</h3>
                      <p>
                        {stat.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} games
                      </p>
                      <p style={{ fontSize: '12px', marginTop: '5px' }}>
                        Avg score: {Math.round(stat.avg_score || 0)}%
                      </p>
                    </div>
                  )) : (
                    <>
                      <div className="stat-card">
                        <h3>0</h3>
                        <p>Computational thinking</p>
                      </div>
                      <div className="stat-card">
                        <h3>0</h3>
                        <p>Typing games</p>
                      </div>
                      <div className="stat-card">
                        <h3>0</h3>
                        <p>Purposeful gaming</p>
                      </div>
                    </>
                  )}
                </div>
                </>)}
                {activeSection === 'progress' && (<>
                {/* ── Progress trend bars ── */}
                {progress.length > 1 && (() => {
                  const sorted = [...progress].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-10);
                  const maxScore = Math.max(...sorted.map(p => p.score || 0), 1);
                  return (
                    <div className="dashboard-section">
                      <div className="section-header">
                        <div>
                          <h2>Score trend</h2>
                          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                            Last {sorted.length} sessions
                          </p>
                        </div>
                      </div>
                      <div className="card" style={{ paddingBottom: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px', paddingTop: '8px' }}>
                          {sorted.map((p, i) => (
                            <div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{p.score ?? 0}%</span>
                              <div
                                title={`${p.game_title} — ${p.score ?? 0}%`}
                                style={{
                                  width: '100%', maxWidth: '40px',
                                  height: `${Math.max(4, Math.round(((p.score || 0) / maxScore) * 90))}px`,
                                  background: p.completed ? 'var(--color-success, #22c55e)' : 'var(--color-primary)',
                                  borderRadius: '4px 4px 0 0',
                                  transition: 'height .3s',
                                }}
                              />
                              <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.2, writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: '52px', overflow: 'hidden' }}>
                                {new Date(p.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p style={{ margin: 'var(--spacing-sm) 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-success, #22c55e)', borderRadius: 2, marginRight: 4 }} />Completed &nbsp;
                          <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-primary)', borderRadius: 2, marginRight: 4 }} />In progress
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="dashboard-section">
                  <div className="section-header">
                    <div>
                      <h2>{currentStudent.name}'s learning journey</h2>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                        Every game session with score, category, and completion status
                      </p>
                    </div>
                  </div>
                  <div className="card">
                    <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Category</th>
                          <th>Score</th>
                          <th>Status</th>
                          <th>Attempts</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progress.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty-state">
                                <p>No activity recorded yet. Progress will appear here as your child engages with learning games.</p>
                                <div className="empty-state-actions">
                                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('sessions')}>
                                    Check Sessions
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          progress.map(p => (
                            <tr key={p.id}>
                              <td>{p.game_title}</td>
                              <td>
                                <span className={`badge badge-${p.category.replace('_', '-')}`}>
                                  {p.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                                  {p.score || 0}%
                                </span>
                              </td>
                              <td>
                                {p.completed ? (
                                  <span style={{ color: 'var(--color-success)', fontWeight: 'var(--font-weight-medium)' }}>
                                    ✓ Completed
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--color-warning)' }}>In Progress</span>
                                )}
                              </td>
                              <td>{p.attempts}</td>
                              <td>{new Date(p.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
                </>)}
                {activeSection === 'sessions' && (
                <div className="dashboard-section">
                  <div className="section-header">
                    <div>
                      <h2>Upcoming sessions</h2>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                        Scheduled sessions for {currentStudent?.name}
                      </p>
                    </div>
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {sessionsLoading ? (
                      <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-tertiary)' }}>Loading…</div>
                    ) : sessions.length === 0 ? (
                      <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                          No sessions scheduled yet. Your tutor will add upcoming sessions here.
                        </p>
                        <div className="empty-state-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('tips')}>
                            Open Home Tips
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="table-scroll">
                      <table className="table" style={{ marginBottom: 0 }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Lesson / Topic</th>
                            <th>Tutor</th>
                            <th>Status / Confirm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map(s => (
                            <tr key={s.id}>
                              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {new Date(s.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                                {s.start_time}{s.end_time ? ` – ${s.end_time}` : ''}
                              </td>
                              <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                {s.lesson_title || s.title || '—'}
                              </td>
                              <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{s.tutor_name || '—'}</td>
                              <td style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                                <span style={{
                                  fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
                                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                  background: s.status === 'scheduled' ? 'var(--color-primary-lighter, #e0f2fe)' : s.status === 'completed' ? '#dcfce7' : '#fee2e2',
                                  color: s.status === 'scheduled' ? 'var(--color-primary)' : s.status === 'completed' ? '#16a34a' : '#dc2626',
                                }}>{s.status}</span>
                                {s.status === 'scheduled' && !s.parent_confirmed && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }}
                                    disabled={confirmingId === s.id}
                                    onClick={() => handleConfirmSession(s.id)}
                                  >
                                    {confirmingId === s.id ? '…' : 'Confirm ✓'}
                                  </button>
                                )}
                                {s.parent_confirmed === 1 && s.status === 'scheduled' && (
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: '#16a34a' }}>✔ Confirmed</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                </div>
                )}
                {activeSection === 'notes' && (
                <div className="dashboard-section">
                  <div className="section-header">
                    <div>
                      <h2>Session notes from your tutor</h2>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                        Observations and updates added by the tutor after each session
                      </p>
                    </div>
                  </div>
                  <div className="card">
                    {notesLoading ? (
                      <p style={{ color: 'var(--color-text-tertiary)' }}>Loading…</p>
                    ) : notes.length === 0 ? (
                      <div className="empty-state">
                        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                          No session notes yet. Notes will appear here after your tutor has recorded observations from a session.
                        </p>
                        <div className="empty-state-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('sessions')}>
                            Review Sessions
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {notes.map(n => (
                          <div key={n.id} style={{ background: 'var(--color-background)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', border: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                              <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
                                {new Date(n.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                              {n.tutor_name && (
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{n.tutor_name}</span>
                              )}
                            </div>
                            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{n.note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                )}
                {activeSection === 'privacy' && (
                <div className="dashboard-section">
                  <div className="section-header">
                    <div>
                      <h2>Consent and privacy</h2>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                        Manage consent and request a copy of your child data
                      </p>
                    </div>
                  </div>
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: savingConsent ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={consent?.parent_consent === 1}
                          disabled={savingConsent || consentLoading}
                          onChange={(event) => handleConsentToggle(event.target.checked)}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)' }}>
                          I approve sharing learning progress and session information with the assigned tutor.
                        </span>
                      </label>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Tutor consent status: {consent?.tutor_consent === 1 ? 'Granted' : 'Pending'}
                      </div>
                      {consentMessage && (
                        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                          {consentMessage}
                        </p>
                      )}
                    </div>
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportRequest} disabled={exportingData}>
                        {exportingData ? 'Preparing Export...' : 'Request Data Export'}
                      </button>
                      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Download a JSON export containing profile, session, note, and progress records for {currentStudent?.name}.
                      </p>
                      {exportMessage && (
                        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                          {exportMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                )}
                {activeSection === 'tips' && (
                <div className="dashboard-section">
                  <div className="section-header">
                    <div>
                      <h2>Tips for supporting digital literacy at home</h2>
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                        Simple ways to reinforce what they’re learning in the program
                      </p>
                    </div>
                  </div>
                  <div className="card">
                    <div className="suggestion-item">
                      <h3>Ask what they played</h3>
                      <p>Chat about which games they did today—computational thinking, typing, or purposeful gaming. Asking “What was tricky?” or “What did you get better at?” builds reflection and motivation.</p>
                    </div>
                    <div className="suggestion-item">
                      <h3>Encourage short, regular practice</h3>
                      <p>Even 10–15 minutes a few times a week helps. Typing and logic skills improve with consistency more than long one-off sessions.</p>
                    </div>
                    <div className="suggestion-item">
                      <h3>Celebrate progress, not just scores</h3>
                      <p>Completion and effort matter. “You finished all three stations!” or “You tried that level again” supports a growth mindset and keeps them engaged.</p>
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
};

export default ParentDashboard;
