import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import Navigation from '../components/Navigation';
import OnboardingModal from '../components/OnboardingModal';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const TEACHER_FILTERS_KEY = 'fd_teacher_filters_v1';
const TEACHER_ONBOARDING_KEY = 'fd_onboarding_teacher_v1';
const TEACHER_SYNC_POLL_INTERVAL_MS = 2000;
const TEACHER_SIDEBAR_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'interventions', label: 'Interventions' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'activity', label: 'Activity' },
] as const;

interface Progress {
  id: string;
  student_name: string;
  grade: number;
  game_title: string;
  category: string;
  score: number;
  completed: boolean;
  attempts: number;
  created_at: string;
}

interface TutorNote {
  id: string;
  student_id: string;
  student_name?: string;
  grade?: number;
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
  student_name?: string;
  student_grade?: number;
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
}

interface Intervention {
  student_id: string;
  student_name: string;
  grade: number | null;
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  avg_score: number;
  days_inactive: number;
  last_activity_at: string | null;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

const TeacherDashboard: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const [showOnboardingTip, setShowOnboardingTip] = useState(() => localStorage.getItem(TEACHER_ONBOARDING_KEY) !== 'dismissed');
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory]   = useState<string>('all');
  const [filterGrade,    setFilterGrade]       = useState<string>('all');
  const [filterStudent,  setFilterStudent]     = useState<string>('');
  const [filterDateFrom, setFilterDateFrom]    = useState<string>('');
  const [filterDateTo,   setFilterDateTo]      = useState<string>('');
  const [expandedStudent, setExpandedStudent]  = useState<string | null>(null);
  const [notes,          setNotes]             = useState<TutorNote[]>([]);
  const [notesLoading,   setNotesLoading]      = useState(false);
  const [notesFilter,    setNotesFilter]       = useState<string>('');
  const [schedule,       setSchedule]          = useState<SessionEntry[]>([]);
  const [schedLoading,   setSchedLoading]      = useState(false);
  const [schedGradeFilter, setSchedGradeFilter] = useState<string>('all');
  const [schedViewFilter, setSchedViewFilter]   = useState<string>('upcoming');
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [interventionsLoading, setInterventionsLoading] = useState(false);
  const syncVersionRef = useRef<string>('');

  const fetchSchedule = useCallback(async () => {
    setSchedLoading(true);
    try {
      const res = await axios.get(`${API_URL}/schedule`);
      setSchedule(res.data || []);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    } finally {
      setSchedLoading(false);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/notes`);
      setNotes(response.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/progress/all`);
      setProgress(response.data);
    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInterventions = useCallback(async () => {
    setInterventionsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/progress/interventions`);
      setInterventions(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching interventions:', error);
      setInterventions([]);
    } finally {
      setInterventionsLoading(false);
    }
  }, []);

  const refreshTeacherData = useCallback(async () => {
    await Promise.all([
      fetchProgress(),
      fetchNotes(),
      fetchSchedule(),
      fetchInterventions(),
    ]);
  }, [fetchInterventions, fetchNotes, fetchProgress, fetchSchedule]);

  const fetchSyncVersion = useCallback(async (): Promise<string | null> => {
    try {
      const response = await axios.get(`${API_URL}/sync/version`);
      const rawVersion = response.data?.version;
      if (typeof rawVersion === 'number' || typeof rawVersion === 'string') {
        return String(rawVersion);
      }
      return null;
    } catch (error) {
      console.error('Error checking sync version:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      syncVersionRef.current = '';
      return;
    }
    void refreshTeacherData();
  }, [authLoading, refreshTeacherData, user]);

  useEffect(() => {
    try {
      const rawFilters = localStorage.getItem(TEACHER_FILTERS_KEY);
      if (rawFilters) {
        const parsed = JSON.parse(rawFilters);
        if (parsed.filterCategory) setFilterCategory(parsed.filterCategory);
        if (parsed.filterGrade) setFilterGrade(parsed.filterGrade);
        if (typeof parsed.filterStudent === 'string') setFilterStudent(parsed.filterStudent);
        if (typeof parsed.filterDateFrom === 'string') setFilterDateFrom(parsed.filterDateFrom);
        if (typeof parsed.filterDateTo === 'string') setFilterDateTo(parsed.filterDateTo);
        if (parsed.schedGradeFilter) setSchedGradeFilter(parsed.schedGradeFilter);
        if (parsed.schedViewFilter) setSchedViewFilter(parsed.schedViewFilter);
        if (
          typeof parsed.activeSection === 'string' &&
          TEACHER_SIDEBAR_ITEMS.some(item => item.id === parsed.activeSection)
        ) {
          setActiveSection(parsed.activeSection);
        }
      }
    } catch {
      // Ignore malformed localStorage values
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      TEACHER_FILTERS_KEY,
      JSON.stringify({
        filterCategory,
        filterGrade,
        filterStudent,
        filterDateFrom,
        filterDateTo,
        schedGradeFilter,
        schedViewFilter,
        activeSection,
      })
    );
  }, [filterCategory, filterGrade, filterStudent, filterDateFrom, filterDateTo, schedGradeFilter, schedViewFilter, activeSection]);

  useEffect(() => {
    if (!TEACHER_SIDEBAR_ITEMS.some(item => item.id === activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection]);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    let checking = false;

    const checkForUpdates = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const nextVersion = await fetchSyncVersion();
        if (!nextVersion) return;

        if (!syncVersionRef.current) {
          syncVersionRef.current = nextVersion;
          return;
        }

        if (syncVersionRef.current !== nextVersion) {
          syncVersionRef.current = nextVersion;
          await refreshTeacherData();
        }
      } finally {
        checking = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void checkForUpdates();
    }, TEACHER_SYNC_POLL_INTERVAL_MS);

    const handleFocus = () => {
      void checkForUpdates();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkForUpdates();
      }
    };

    void checkForUpdates();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authLoading, fetchSyncVersion, refreshTeacherData, user]);

  const dismissOnboardingTip = () => {
    localStorage.setItem(TEACHER_ONBOARDING_KEY, 'dismissed');
    setShowOnboardingTip(false);
  };


  const filteredProgress = progress.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterGrade    !== 'all' && String(p.grade) !== filterGrade) return false;
    if (filterStudent  && !p.student_name.toLowerCase().includes(filterStudent.toLowerCase())) return false;
    if (filterDateFrom && new Date(p.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo   && new Date(p.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    return true;
  });

  const activeFilters = [filterCategory !== 'all', filterGrade !== 'all', !!filterStudent, !!filterDateFrom, !!filterDateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCategory('all');
    setFilterGrade('all');
    setFilterStudent('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };


  const studentNotes = (name: string) => notes.filter(n => n.student_name === name);

  const uniqueStudents = Array.from(new Set(progress.map(p => p.student_name))).length;
  const stats = {
    total: progress.length,
    completed: progress.filter(p => p.completed).length,
    avgScore: progress.length > 0
      ? Math.round(progress.reduce((sum, p) => sum + (p.score || 0), 0) / progress.length)
      : 0,
    uniqueStudents,
    byCategory: {
      computational_thinking: progress.filter(p => p.category === 'computational_thinking').length,
      typing: progress.filter(p => p.category === 'typing').length,
      purposeful_gaming: progress.filter(p => p.category === 'purposeful_gaming').length,
    }
  };

  // Active this week (unique students with a session in last 7 days)
  const today = new Date();
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const todayStr = today.toISOString().split('T')[0];
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  const activeThisWeek = new Set(
    schedule.filter(s => s.session_date >= sevenDaysAgoStr && s.session_date <= todayStr).map(s => s.student_name)
  ).size;

  // Avg score by grade
  const avgByGrade = [4,5,6,7,8,9].map(g => {
    const gp = progress.filter(p => p.grade === g);
    return { grade: g, count: gp.length, avg: gp.length > 0 ? Math.round(gp.reduce((s, p) => s + (p.score || 0), 0) / gp.length) : null };
  }).filter(g => g.count > 0);

  // Inactivity: students with no upcoming sessions AND last session > 14 days ago (or never)
  const fourteenDaysAgo = new Date(today); fourteenDaysAgo.setDate(today.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];
  const studentNamesFromSchedule = Array.from(new Set(schedule.map(s => s.student_name).filter(Boolean))) as string[];
  const studentNamesFromProgress = Array.from(new Set(progress.map(p => p.student_name)));
  const allKnownStudents = Array.from(new Set([...studentNamesFromSchedule, ...studentNamesFromProgress]));
  const inactiveStudents = allKnownStudents.filter(name => {
    const stuSessions = schedule.filter(s => s.student_name === name);
    const hasUpcoming = stuSessions.some(s => s.session_date >= todayStr && s.status === 'scheduled');
    if (hasUpcoming) return false;
    const lastSession = stuSessions.filter(s => s.status === 'completed').sort((a, b) => b.session_date.localeCompare(a.session_date))[0];
    if (!lastSession) return true; // never had a session
    return lastSession.session_date <= fourteenDaysAgoStr;
  });

  const todayScheduled = schedule.filter(s => s.status === 'scheduled' && s.session_date === todayStr).length;
  const upcomingScheduled = schedule.filter(s => s.status === 'scheduled' && s.session_date >= todayStr).length;
  const completedThisWeek = schedule.filter(s => s.status === 'completed' && s.session_date >= sevenDaysAgoStr && s.session_date <= todayStr).length;
  const recentNotesCount = notes.filter(n => n.session_date >= sevenDaysAgoStr).length;
  const highRiskInterventions = interventions.filter(i => i.risk_level === 'high').length;
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;


  // CSV export
  const downloadCSV = () => {
    const rows = [['Student', 'Grade', 'Game', 'Category', 'Score', 'Status', 'Attempts', 'Date']];
    filteredProgress.forEach(p => {
      rows.push([
        p.student_name, String(p.grade), p.game_title,
        p.category.replace(/_/g, ' '), String(p.score ?? 0),
        p.completed ? 'Completed' : 'In Progress',
        String(p.attempts),
        new Date(p.created_at).toLocaleDateString('en-ZA'),
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'student_activity.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard">
      <Navigation />
      <header className="dashboard-header">
        <div>
          <h1>Student Analytics</h1>
          <p>
            View schedules and monitor learners&apos; progress.
          </p>
        </div>
        <div className="header-actions" style={{ justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
            <span style={{ display: 'block', fontWeight: 'var(--font-weight-semibold)' }}>{user?.name}</span>
            {user?.school_name && (
              <span style={{ display: 'block', fontWeight: 'var(--font-weight-semibold)', color: 'inherit' }}>
                {user.school_name}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <nav className="dashboard-sidebar">
          <div className="dashboard-sidebar-label">Navigation</div>
          {TEACHER_SIDEBAR_ITEMS.map(item => (
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
        <OnboardingModal
          isOpen={showOnboardingTip}
          role="teacher"
          onComplete={dismissOnboardingTip}
        />
        {progress.length === 0 && (
          <div className="card demo-banner" style={{ marginBottom: 'var(--spacing-xl)' }}>
            <strong>No activity yet.</strong> Game sessions will appear here once learners complete games. To try this view with sample data, log in as <strong>Tutor</strong>, run &quot;Load Sample Data&quot;, then return here.
            <div className="empty-state-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('overview')}>
                Open Overview
              </button>
            </div>
          </div>
        )}
        {activeSection === 'overview' && (<>
        <section className="card overview-panel" aria-label="Teacher overview">
          <div className="overview-header">
            <h2>Teacher Overview</h2>
            <p>One place to monitor schedules, interventions, activity, and notes.</p>
          </div>
          <div className="operations-overview-tables">
            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>Interventions</h3>
                <p>Prioritize flagged learners and quickly identify urgency.</p>
              </div>
              <div className="table-scroll operations-table-scroll">
                <table className="table operations-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Flagged learners</td>
                      <td>
                        <span className="metric-chip metric-chip--info">
                          {interventions.length}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>High-risk interventions</td>
                      <td>
                        <span className={`metric-chip ${highRiskInterventions > 0 ? 'metric-chip--risk' : 'metric-chip--good'}`}>
                          {highRiskInterventions}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Inactive 14+ days</td>
                      <td>
                        <span className={`metric-chip ${inactiveStudents.length > 0 ? 'metric-chip--warn' : 'metric-chip--good'}`}>
                          {inactiveStudents.length}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>Schedule</h3>
                <p>Track short-term workload and session pipeline.</p>
              </div>
              <div className="table-scroll operations-table-scroll">
                <table className="table operations-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Sessions today</td>
                      <td>
                        <span className="metric-chip metric-chip--neutral">{todayScheduled}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Upcoming sessions</td>
                      <td>
                        <span className="metric-chip metric-chip--info">{upcomingScheduled}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Completed this week</td>
                      <td>
                        <span className="metric-chip metric-chip--good">{completedThisWeek}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>Activity and Notes</h3>
                <p>Connect engagement and learning progress with tutor observations.</p>
              </div>
              <div className="table-scroll operations-table-scroll">
                <table className="table operations-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Learners active this week</td>
                      <td>
                        <span className="metric-chip metric-chip--info">{activeThisWeek}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Activity completion</td>
                      <td>
                        <span className={`metric-chip metric-chip--${completionRate >= 80 ? 'good' : completionRate >= 50 ? 'warn' : 'risk'}`}>
                          {completionRate}%
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Tutor notes this week</td>
                      <td>
                        <span className="metric-chip metric-chip--neutral">{recentNotesCount}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>


        {/* ── Inactivity alerts ────────────────────────────────── */}
        {inactiveStudents.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--spacing-xl)', borderLeft: '4px solid var(--color-warning, #f59e0b)', padding: 'var(--spacing-md) var(--spacing-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <div>
                <p style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-xs)' }}>
                  {inactiveStudents.length} student{inactiveStudents.length > 1 ? 's' : ''} may need attention
                </p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-sm)' }}>
                  No upcoming sessions and no completed session in the last 14 days.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                  {inactiveStudents.map(name => (
                    <span key={name} style={{ fontSize: 'var(--font-size-sm)', background: '#fef3c7', color: '#92400e', borderRadius: 'var(--radius-full)', padding: '2px 10px', fontWeight: 500 }}>{name}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        </>)}
        {activeSection === 'interventions' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Intervention list</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Learners flagged for low completion, inactivity, or low scores
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={fetchInterventions} disabled={interventionsLoading}>
              {interventionsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {interventionsLoading ? (
              <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-tertiary)' }}>Loading...</div>
            ) : interventions.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
                <p>No interventions are currently flagged.</p>
                <div className="empty-state-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('activity')}>
                    Review Activity
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Grade</th>
                    <th>Risk</th>
                    <th>Completion</th>
                    <th>Avg score</th>
                    <th>Inactive (days)</th>
                    <th>Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {interventions.map((item) => (
                    <tr key={item.student_id}>
                      <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{item.student_name}</td>
                      <td>{item.grade !== null ? `Grade ${item.grade}` : '—'}</td>
                      <td>
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-semibold)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background:
                              item.risk_level === 'high'
                                ? '#fee2e2'
                                : item.risk_level === 'medium'
                                  ? '#fef3c7'
                                  : '#dcfce7',
                            color:
                              item.risk_level === 'high'
                                ? '#b91c1c'
                                : item.risk_level === 'medium'
                                  ? '#92400e'
                                  : '#166534',
                          }}
                        >
                          {item.risk_level.toUpperCase()} ({item.risk_score})
                        </span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.completion_rate}%</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.avg_score}%</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.days_inactive}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {item.reasons.map((reason) => (
                            <span
                              key={`${item.student_id}-${reason}`}
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                background: 'var(--color-surface-subtle)',
                                color: 'var(--color-text-secondary)',
                                borderRadius: 'var(--radius-full)',
                                padding: '2px 8px',
                              }}
                            >
                              {reason.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
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
        {activeSection === 'activity' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Learning activity</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                {filteredProgress.length} session{filteredProgress.length !== 1 ? 's' : ''} shown
                {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters !== 1 ? 's' : ''} active`}
              </p>
            </div>
            <button className="btn btn-secondary" onClick={downloadCSV} title="Download filtered data as CSV" disabled={filteredProgress.length === 0}>
              ⬇ Export CSV
            </button>
          </div>

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--spacing-sm)', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', display: 'block', marginBottom: 4 }}>Student</label>
                <input
                  className="input"
                  placeholder="Search name…"
                  value={filterStudent}
                  onChange={e => setFilterStudent(e.target.value)}
                  style={{ fontSize: 'var(--font-size-sm)' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', display: 'block', marginBottom: 4 }}>Grade</label>
                <select className="input" value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={{ fontSize: 'var(--font-size-sm)' }}>
                  <option value="all">All grades</option>
                  {[4,5,6,7,8,9].map(g => <option key={g} value={String(g)}>Grade {g}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', display: 'block', marginBottom: 4 }}>Category</label>
                <select className="input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ fontSize: 'var(--font-size-sm)' }}>
                  <option value="all">All categories</option>
                  <option value="computational_thinking">Computational Thinking</option>
                  <option value="typing">Typing</option>
                  <option value="purposeful_gaming">Purposeful Gaming</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', display: 'block', marginBottom: 4 }}>From date</label>
                <input type="date" className="input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ fontSize: 'var(--font-size-sm)' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', display: 'block', marginBottom: 4 }}>To date</label>
                <input type="date" className="input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ fontSize: 'var(--font-size-sm)' }} />
              </div>
              {activeFilters > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={clearFilters} style={{ width: '100%' }}>Clear filters</button>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filteredProgress.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
                <p>
                  {progress.length === 0
                    ? 'No game sessions yet. When learners play games from their dashboard, activity will show here.'
                    : 'No sessions match the current filters. Try adjusting or clearing them.'}
                </p>
                <div className="empty-state-actions">
                  {progress.length === 0 ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('schedule')}>
                      View Schedule
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Grade</th>
                    <th>Game</th>
                    <th>Category</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Date</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProgress.map(p => {
                    const isExpanded = expandedStudent === p.student_name;
                    const sNotes = studentNotes(p.student_name);
                    return (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{p.student_name}</td>
                          <td>Grade {p.grade}</td>
                          <td>{p.game_title}</td>
                          <td>
                            <span className={`badge badge-${p.category.replace('_', '-')}`}>
                              {p.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.score ?? 0}%</td>
                          <td>
                            <span style={{ color: p.completed ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                              {p.completed ? 'Done' : 'In progress'}
                            </span>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.attempts}</td>
                          <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                            {new Date(p.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setExpandedStudent(isExpanded ? null : p.student_name)}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {sNotes.length > 0 ? `Notes (${sNotes.length})` : 'Notes'}
                              {' '}{isExpanded ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${p.id}-notes`}>
                            <td colSpan={9} style={{ background: 'var(--color-surface)', padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                              <p style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-sm)' }}>
                                Tutor notes for {p.student_name}
                              </p>
                              {notesLoading ? (
                                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>Loading…</p>
                              ) : sNotes.length === 0 ? (
                                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No tutor notes for this student yet.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                  {sNotes.map(n => (
                                    <div key={n.id} style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)' }}>
                                          {new Date(n.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        {n.tutor_name && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{n.tutor_name}</span>}
                                      </div>
                                      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
        )}
        {activeSection === 'schedule' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Session Schedule</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                All scheduled, completed, and cancelled sessions across your learners
              </p>
            </div>
            <div className="section-primary-actions">
              <select className="input" value={schedGradeFilter} onChange={e => setSchedGradeFilter(e.target.value)} style={{ fontSize: 'var(--font-size-sm)', width: 'auto' }}>
                <option value="all">All grades</option>
                {[4,5,6,7,8,9].map(g => <option key={g} value={String(g)}>Grade {g}</option>)}
              </select>
              <select className="input" value={schedViewFilter} onChange={e => setSchedViewFilter(e.target.value)} style={{ fontSize: 'var(--font-size-sm)', width: 'auto' }}>
                <option value="upcoming">Upcoming</option>
                <option value="all">All sessions</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {schedLoading ? (
              <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-tertiary)' }}>Loading…</div>
            ) : (() => {
              const today = new Date().toISOString().split('T')[0];
              const filtered = schedule.filter(s => {
                if (schedGradeFilter !== 'all' && String(s.student_grade) !== schedGradeFilter) return false;
                if (schedViewFilter === 'upcoming')  return s.status === 'scheduled' && s.session_date >= today;
                if (schedViewFilter === 'completed') return s.status === 'completed';
                return true;
              });
              return filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
                  <p>No {schedViewFilter === 'all' ? '' : schedViewFilter} sessions found.</p>
                  <div className="empty-state-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSchedViewFilter('all')}>
                      Show All Sessions
                    </button>
                  </div>
                </div>
              ) : (
                <div className="table-scroll">
                <table className="table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Grade</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Lesson / Title</th>
                      <th>Tutor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{s.student_name}</td>
                        <td>Grade {s.student_grade}</td>
                        <td style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(s.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {s.start_time}{s.end_time ? ` – ${s.end_time}` : ''}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                          {s.lesson_title || s.title || '—'}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{s.tutor_name || '—'}</td>
                        <td>
                          <span style={{
                            fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
                            padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            background: s.status === 'scheduled' ? 'var(--color-primary-lighter, #e0f2fe)' : s.status === 'completed' ? '#dcfce7' : '#fee2e2',
                            color: s.status === 'scheduled' ? 'var(--color-primary)' : s.status === 'completed' ? '#16a34a' : '#dc2626',
                          }}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              );
            })()}
          </div>
        </div>
        )}
        {activeSection === 'notes' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Tutor Session Notes</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Notes added by tutors after each session
              </p>
            </div>
            {notes.length > 0 && (
              <div style={{ minWidth: 200 }}>
                <select
                  className="input"
                  value={notesFilter}
                  onChange={e => setNotesFilter(e.target.value)}
                  style={{ fontSize: 'var(--font-size-sm)' }}
                >
                  <option value="">All students</option>
                  {Array.from(new Set(notes.map(n => n.student_name).filter(Boolean))).map(name => (
                    <option key={name} value={name!}>{name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="card">
            {notesLoading ? (
              <p style={{ color: 'var(--color-text-tertiary)' }}>Loading…</p>
            ) : notes.length === 0 ? (
              <div className="empty-state">
                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                  No tutor notes have been added yet. Notes will appear here once tutors complete sessions and record observations.
                </p>
                <div className="empty-state-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSection('schedule')}>
                    Check Schedule
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {notes
                  .filter(n => !notesFilter || n.student_name === notesFilter)
                  .map(n => (
                    <div key={n.id} style={{ background: 'var(--color-background)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{n.student_name}</span>
                          {n.grade && <span className="badge badge-info">Grade {n.grade}</span>}
                        </div>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          {new Date(n.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {n.tutor_name && ` · ${n.tutor_name}`}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{n.note}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
