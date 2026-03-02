import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import Navigation from '../components/Navigation';
import OnboardingModal from '../components/OnboardingModal';
import WysiwygEditor from '../components/WysiwygEditor';
import {
  createEmptyLessonContent,
  createLessonHtmlFromLegacyContent,
  parseLessonContentJson,
  serializeLessonContentJson,
  type LessonContentData,
} from '../utils/lessonContent';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const TUTOR_FILTERS_KEY = 'fd_tutor_filters_v1';
const TUTOR_ONBOARDING_KEY = 'fd_onboarding_tutor_v1';
const TUTOR_STUDENT_DRAFT_KEY = 'fd_tutor_draft_student_v1';
const TUTOR_SCHEDULE_DRAFT_KEY = 'fd_tutor_draft_schedule_v1';
const TUTOR_NOTE_DRAFT_KEY = 'fd_tutor_draft_note_v1';
const TUTOR_DONE_NOTE_DRAFT_KEY = 'fd_tutor_draft_done_note_v1';
const UNASSIGNED_SCHOOL_SCOPE_ID = '__unassigned_school__';
const ALL_SCHOOL_SCOPE_ID = '__all_schools__';
const MAX_GAME_THUMBNAIL_BYTES = 350 * 1024;
const MAX_LESSON_THUMBNAIL_BYTES = 3 * 1024 * 1024;

type CalendarProvider = 'google' | 'microsoft';
type StationCategory = 'computational_thinking' | 'typing' | 'purposeful_gaming';
type AnalyticsExportDataset = 'school_outcomes' | 'lesson_performance' | 'station_improvements';
type AnalyticsExportFormat = 'csv' | 'json';

const CALENDAR_PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Calendar',
};

const STATION_CATEGORY_LABELS: Record<StationCategory, string> = {
  computational_thinking: 'Computational Thinking',
  typing: 'Typing',
  purposeful_gaming: 'Purposeful Gaming',
};

const STATION_CATEGORIES: StationCategory[] = [
  'computational_thinking',
  'typing',
  'purposeful_gaming',
];

const ANALYTICS_EXPORT_DATASET_OPTIONS: Array<{
  id: AnalyticsExportDataset;
  label: string;
  description: string;
}> = [
  {
    id: 'school_outcomes',
    label: 'School Outcomes',
    description: 'Enrolment, sessions, attendance, confirmations, engagement, coverage, completion, attempts, and time spent.',
  },
  {
    id: 'lesson_performance',
    label: 'Lesson Performance by School',
    description: 'Assigned/active learners, completion, correct responses, attempts, and time spent by lesson.',
  },
  {
    id: 'station_improvements',
    label: 'Station Improvements',
    description: 'Computational thinking, typing, and purposeful gaming improvement coverage and score changes.',
  },
];

const isCalendarProvider = (value: string): value is CalendarProvider =>
  value === 'google' || value === 'microsoft';

interface Student {
  id: string;
  name: string;
  email?: string;
  grade: number;
  age: number;
  parent_id?: string;
  teacher_id?: string;
  school_id?: string;
}

interface Game {
  id: string;
  title: string;
  description?: string;
  category: string;
  difficulty_level: number;
  game_url?: string;
  thumbnail_url?: string;
  instructions?: string;
  tracking_enabled?: boolean;
}

interface School {
  id: string;
  name: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  school_id?: string;
  school_name?: string;
}

interface Progress {
  id: string;
  student_id?: string;
  student_name: string;
  grade?: number;
  lesson_id?: string;
  lesson_title?: string;
  game_id?: string;
  game_title: string;
  category: string;
  score: number;
  completed: boolean;
  attempts: number;
  time_spent?: number;
  created_at: string;
  updated_at?: string;
}

interface Lesson {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  lesson_content_json?: string | null;
  created_at?: string;
  station_1_game_id?: string;
  station_2_game_id?: string;
  station_3_game_id?: string;
  station_1_title?: string;
  station_2_title?: string;
  station_3_title?: string;
}

interface School {
  id: string;
  name: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
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
  parent_confirmed?: number;
  created_at: string;
}

interface StudentLesson {
  id: string;
  student_id: string;
  lesson_id: string;
  lesson_title: string;
}

interface StudentFormState {
  name: string;
  email: string;
  grade: string;
  age: string;
  learner_pin: string;
  parent_id: string;
  teacher_id: string;
  school_id: string;
}

type StudentFormField = keyof StudentFormState;

interface PendingUndoAction {
  id: string;
  message: string;
  timeoutId: number;
  commit: () => Promise<void>;
  rollback: () => void;
}

interface ProfileTimelineItem {
  id: string;
  date: string;
  type: 'session' | 'note' | 'progress' | 'alert';
  title: string;
  detail: string;
  statusColor?: string;
}

interface StudentDraftPayload {
  form: StudentFormState;
  step: number;
}

interface ScheduleDraftPayload {
  schoolId: string;
  studentId: string;
  studentIds: string[];
  lessonId: string;
  title: string;
  date: string;
  start: string;
  end: string;
  notes: string;
  recurWeeks: number;
  step: number;
}

interface NoteDraftPayload {
  studentId: string;
  note: string;
  date: string;
}

interface DoneNoteDraftPayload {
  sessionId: string;
  note: string;
  date: string;
}

interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'default' | 'danger';
}

interface NoticeDialogOptions {
  title?: string;
  tone?: 'default' | 'success' | 'danger';
  dismissLabel?: string;
}

interface NoticeDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  tone: 'default' | 'success' | 'danger';
  dismissLabel: string;
}

interface GameFormState {
  title: string;
  description: string;
  category: string;
  difficulty_level: string;
  game_url: string;
  thumbnail_url: string;
  instructions: string;
  tracking_enabled: boolean;
}

interface LessonFormState {
  title: string;
  description: string;
  thumbnail_url: string;
  lesson_content: LessonContentData;
  station_1_game_id: string;
  station_2_game_id: string;
  station_3_game_id: string;
}

interface SchoolOutcomeSummaryRow {
  school_id: string;
  school_name: string;
  learner_enrolment: number;
  teachers_total: number;
  parents_total: number;
  learners_with_teacher: number;
  learners_with_parent: number;
  active_teachers: number;
  active_parents: number;
  teacher_engagement_rate: number;
  parent_engagement_rate: number;
  sessions_total: number;
  sessions_completed: number;
  sessions_cancelled: number;
  sessions_upcoming: number;
  sessions_overdue: number;
  session_attendance_rate: number;
  parent_confirmed_sessions: number;
  parent_confirmation_rate: number;
  lesson_assignments_total: number;
  learners_with_lesson_plan: number;
  lesson_plan_coverage_rate: number;
  game_attempts: number;
  game_completions: number;
  game_completion_rate: number;
  average_correct_percent: number;
  total_game_time_spent_seconds: number;
  average_time_per_attempt_seconds: number;
}

interface SchoolLessonLearnerPerformanceRow {
  school_id: string;
  school_name: string;
  lesson_id: string;
  lesson_title: string;
  learner_id: string;
  learner_name: string;
  grade: string;
  games_attempted: number;
  games_completed: number;
  completion_rate: number;
  average_correct_percent: number;
  best_correct_percent: number;
  total_attempts: number;
  total_time_spent: number;
  last_activity: string;
}

interface SchoolLessonSummaryRow {
  school_id: string;
  school_name: string;
  lesson_id: string;
  lesson_title: string;
  learners_assigned: number;
  learners_active: number;
  games_attempted: number;
  games_completed: number;
  completion_rate_percent: number;
  average_correct_responses_percent: number;
  total_attempts: number;
  total_time_spent_seconds: number;
}

interface StationImprovementRow {
  category: StationCategory;
  station_label: string;
  learners_measured: number;
  total_attempts: number;
  completion_rate: number;
  average_baseline_score: number;
  average_latest_score: number;
  average_improvement_points: number;
}

interface OperationsOverviewPayload {
  generated_at: string;
  source: 'database' | string;
  school_outcomes: SchoolOutcomeSummaryRow[];
  lesson_performance: SchoolLessonSummaryRow[];
  station_improvements: StationImprovementRow[];
  record_counts?: {
    schools: number;
    students: number;
    users: number;
    sessions: number;
    student_lessons: number;
    progress: number;
  };
}

interface TutorCalendarIntegrationStatus {
  provider: CalendarProvider;
  configured: boolean;
  linked: boolean;
  external_email: string | null;
  token_expires_at: string | null;
  updated_at: string | null;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Invalid image data'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

const TutorDashboard: React.FC = () => {
  const { user, logout, loading: authLoading } = useAuth();
  const [showOnboardingTip, setShowOnboardingTip] = useState(() => localStorage.getItem(TUTOR_ONBOARDING_KEY) !== 'dismissed');
  const [students, setStudents] = useState<Student[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [parents, setParents] = useState<User[]>([]);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showLessonDetailModal, setShowLessonDetailModal] = useState(false);
  const [lessonDetailId, setLessonDetailId] = useState<string>('');
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showParentModal, setShowParentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('lessons');

  // ── School detail modal
  const [showSchoolDetailModal, setShowSchoolDetailModal] = useState(false);
  const [schoolDetailId,        setSchoolDetailId]        = useState<string>('');
  const [schoolDetailTab,       setSchoolDetailTab]       = useState<'teachers'|'students'|'parents'>('teachers');
  const [modalPreschoolId,      setModalPreschoolId]      = useState<string>('');

  // ── Session Notes ─────────────────────────────────────────
  const [showNotesModal,  setShowNotesModal]  = useState(false);
  const [notesStudentId,  setNotesStudentId]  = useState<string>('');
  const [notes,           setNotes]           = useState<TutorNote[]>([]);
  const [noteText,        setNoteText]        = useState('');
  const [noteDate,        setNoteDate]        = useState(() => new Date().toISOString().split('T')[0]);
  const [editingNoteId,   setEditingNoteId]   = useState<string | null>(null);
  const [notesLoading,    setNotesLoading]    = useState(false);

  // ── Schedule ──────────────────────────────────────────────
  const [schedule,        setSchedule]        = useState<SessionEntry[]>([]);
  const [showSchedModal,  setShowSchedModal]  = useState(false);
  const [editingSession,  setEditingSession]  = useState<SessionEntry | null>(null);
  const [schedSchoolId,   setSchedSchoolId]   = useState<string>('');
  const [schedSchoolFilterId, setSchedSchoolFilterId] = useState<string>(ALL_SCHOOL_SCOPE_ID);
  const [schedStudentId,  setSchedStudentId]  = useState<string>('');
  const [schedStudentIds, setSchedStudentIds] = useState<string[]>([]);
  const [schedLessonId,   setSchedLessonId]   = useState<string>('');
  const [schedTitle,      setSchedTitle]      = useState<string>('');
  const [schedDate,       setSchedDate]       = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [schedStart,      setSchedStart]      = useState<string>('09:00');
  const [schedEnd,        setSchedEnd]        = useState<string>('10:00');
  const [schedNotes,      setSchedNotes]      = useState<string>('');
  const [schedRecurWeeks, setSchedRecurWeeks] = useState<number>(0);
  const [schedLoading,    setSchedLoading]    = useState(false);
  const [schedFilter,     setSchedFilter]     = useState<string>('upcoming');
  const [schedViewMode,   setSchedViewMode]   = useState<'list' | 'calendar'>('calendar');
  const [schedCalendarMonth, setSchedCalendarMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [schedCalendarDate, setSchedCalendarDate] = useState<string>('');
  const [calendarIntegrations, setCalendarIntegrations] = useState<TutorCalendarIntegrationStatus[]>([]);
  const [calendarIntegrationsLoading, setCalendarIntegrationsLoading] = useState(false);
  const [calendarActionProvider, setCalendarActionProvider] = useState<CalendarProvider | ''>('');
  const [calendarNotice, setCalendarNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // ── Lesson assignment ─────────────────────────────────────
  const [studentLessons,  setStudentLessons]  = useState<StudentLesson[]>([]);
  const [operationsOverview, setOperationsOverview] = useState<OperationsOverviewPayload | null>(null);
  const [operationsOverviewLoading, setOperationsOverviewLoading] = useState(false);
  const [operationsOverviewError, setOperationsOverviewError] = useState('');
  const [showAnalyticsExportModal, setShowAnalyticsExportModal] = useState(false);
  const [analyticsExportFormat, setAnalyticsExportFormat] = useState<AnalyticsExportFormat>('csv');
  const [analyticsExportSelections, setAnalyticsExportSelections] = useState<Record<AnalyticsExportDataset, boolean>>({
    school_outcomes: true,
    lesson_performance: false,
    station_improvements: false,
  });

  // ── Student profile modal ─────────────────────────────────
  const [showProfileModal,  setShowProfileModal]   = useState(false);
  const [profileStudentId,  setProfileStudentId]   = useState<string>('');
  const [profileProgress,   setProfileProgress]    = useState<Progress[]>([]);
  const [profileNotes,      setProfileNotes]       = useState<TutorNote[]>([]);
  const [profileLoading,    setProfileLoading]     = useState(false);
  const [profileSchoolId,   setProfileSchoolId]    = useState<string>('');
  const [profileTeacherId,  setProfileTeacherId]   = useState<string>('');
  const [profileParentId,   setProfileParentId]    = useState<string>('');
  const [profileSavingLinks, setProfileSavingLinks] = useState(false);

  // ── Mark-done-with-note modal ─────────────────────────────
  const [showDoneModal,   setShowDoneModal]   = useState(false);
  const [doneSessionId,   setDoneSessionId]   = useState<string>('');
  const [doneNoteText,    setDoneNoteText]    = useState<string>('');
  const [doneNoteDate,    setDoneNoteDate]    = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState<StudentFormState>({
    name: '',
    email: '',
    grade: '',
    age: '',
    learner_pin: '',
    parent_id: '',
    teacher_id: '',
    school_id: '',
  });
  const [studentFormTouched, setStudentFormTouched] = useState<Record<StudentFormField, boolean>>({
    name: false,
    email: false,
    grade: false,
    age: false,
    learner_pin: false,
    parent_id: false,
    teacher_id: false,
    school_id: false,
  });
  const [studentSubmitAttempted, setStudentSubmitAttempted] = useState(false);
  const [studentSubmitting, setStudentSubmitting] = useState(false);
  const [lessonAssignmentErrors, setLessonAssignmentErrors] = useState<Record<string, string>>({});
  const [lessonAssignmentSavingId, setLessonAssignmentSavingId] = useState<string | null>(null);
  const [scheduleSubmitAttempted, setScheduleSubmitAttempted] = useState(false);
  const [studentWizardStep, setStudentWizardStep] = useState(1);
  const [schedWizardStep, setSchedWizardStep] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [rosterSchoolId, setRosterSchoolId] = useState<string>('');
  const [pendingUndoAction, setPendingUndoAction] = useState<PendingUndoAction | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: 'Confirm Action',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'default',
  });
  const [noticeDialog, setNoticeDialog] = useState<NoticeDialogState>({
    isOpen: false,
    title: 'Notice',
    message: '',
    tone: 'default',
    dismissLabel: 'Close',
  });
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const confirmDialogResolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);
  const [gameForm, setGameForm] = useState<GameFormState>({
    title: '',
    description: '',
    category: '',
    difficulty_level: '1',
    game_url: '',
    thumbnail_url: '',
    instructions: '',
    tracking_enabled: true,
  });
  const [lessonForm, setLessonForm] = useState<LessonFormState>({
    title: '',
    description: '',
    thumbnail_url: '',
    lesson_content: createEmptyLessonContent(),
    station_1_game_id: '',
    station_2_game_id: '',
    station_3_game_id: '',
  });

  const studentFormErrors = {
    name:
      studentForm.name.trim().length === 0
        ? 'Learner name is required.'
        : studentForm.name.trim().length < 2
          ? 'Use at least 2 characters.'
          : '',
    email:
      studentForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentForm.email.trim())
        ? 'Enter a valid email address or leave blank.'
        : '',
    grade:
      studentForm.grade.trim().length === 0
        ? 'Grade is required.'
        : Number.isNaN(Number(studentForm.grade)) || Number(studentForm.grade) < 4 || Number(studentForm.grade) > 9
          ? 'Grade must be between 4 and 9.'
          : '',
    age:
      studentForm.age.trim().length === 0
        ? 'Age is required.'
        : Number.isNaN(Number(studentForm.age)) || Number(studentForm.age) < 9 || Number(studentForm.age) > 16
          ? 'Age must be between 9 and 16.'
          : '',
    learner_pin:
      !editingStudentId && studentForm.learner_pin.trim().length === 0
        ? 'Learner PIN is required.'
        : studentForm.learner_pin.trim().length > 0 && !/^\d{4,8}$/.test(studentForm.learner_pin.trim())
          ? 'Learner PIN must be 4-8 digits.'
          : '',
  };

  const isStudentFormValid = !Object.values(studentFormErrors).some(Boolean);
  const shouldShowStudentError = (field: keyof typeof studentFormErrors) =>
    studentSubmitAttempted || studentFormTouched[field];

  const hasUnassignedLearners = students.some(student => !student.school_id);
  const schoolScopeOptions = [
    ...schools.map(school => ({ id: school.id, label: school.name })),
    ...(hasUnassignedLearners
      ? [{ id: UNASSIGNED_SCHOOL_SCOPE_ID, label: 'Unassigned learners' }]
      : []),
  ];

  const getStudentsForSchoolScope = (schoolScopeId: string) => {
    if (!schoolScopeId) return [];
    if (schoolScopeId === UNASSIGNED_SCHOOL_SCOPE_ID) {
      return students.filter(student => !student.school_id);
    }
    return students.filter(student => student.school_id === schoolScopeId);
  };

  const getSchoolLabelForScope = (schoolScopeId: string) => {
    if (schoolScopeId === UNASSIGNED_SCHOOL_SCOPE_ID) return 'Unassigned learners';
    return schools.find(school => school.id === schoolScopeId)?.name || 'Unknown school';
  };

  const getSchoolScopeForStudent = (studentId: string) => {
    const learner = students.find(student => student.id === studentId);
    if (!learner) return '';
    return learner.school_id || UNASSIGNED_SCHOOL_SCOPE_ID;
  };

  const rosterStudents = getStudentsForSchoolScope(rosterSchoolId).filter(student =>
    `${student.name} ${student.email || ''} grade ${student.grade}`.toLowerCase().includes(studentSearch.trim().toLowerCase())
  );

  const getSortedAssignmentsForStudent = (studentId: string) =>
    studentLessons
      .filter(assignment => assignment.student_id === studentId)
      .sort((a, b) => a.lesson_title.localeCompare(b.lesson_title));

  const schedLearnersForSchool = getStudentsForSchoolScope(schedSchoolId);

  const selectedScheduleStudentIds = editingSession
    ? (schedStudentId ? [schedStudentId] : [])
    : schedStudentIds.filter(studentId => schedLearnersForSchool.some(student => student.id === studentId));

  const resolveLinkedGameTitle = (gameId?: string, fallbackTitle?: string) => {
    if (gameId) {
      const linkedGame = games.find(game => game.id === gameId);
      if (linkedGame?.title) return linkedGame.title;
    }
    return fallbackTitle || '';
  };

  const scheduleValidationError =
    !schedSchoolId
      ? 'Choose a school to schedule.'
      : schedLearnersForSchool.length === 0
        ? 'No learners found in this school. Add a learner first.'
        : selectedScheduleStudentIds.length === 0
          ? editingSession
            ? 'Choose a learner to schedule.'
            : 'Choose at least one learner to schedule.'
          : !schedDate
            ? 'Choose a session date.'
            : !schedStart
              ? 'Choose a start time.'
              : schedEnd && schedEnd <= schedStart
                ? 'End time must be later than start time.'
                : '';

  const canSaveSchedule = !scheduleValidationError;

  const canContinueStudentWizardStep1 = !studentFormErrors.name && !studentFormErrors.email;
  const canContinueStudentWizardStep2 = !studentFormErrors.grade && !studentFormErrors.age && !studentFormErrors.learner_pin;

  const calendarProviderOptions: CalendarProvider[] = ['google', 'microsoft'];
  const getCalendarIntegrationStatus = (provider: CalendarProvider): TutorCalendarIntegrationStatus =>
    calendarIntegrations.find(item => item.provider === provider) || {
      provider,
      configured: false,
      linked: false,
      external_email: null,
      token_expires_at: null,
      updated_at: null,
    };

  const createEmptyStudentForm = (schoolId = ''): StudentFormState => ({
    name: '',
    email: '',
    grade: '',
    age: '',
    learner_pin: '',
    parent_id: '',
    teacher_id: '',
    school_id: schoolId,
  });

  const readStudentDraft = (schoolId = ''): StudentDraftPayload | null => {
    try {
      const raw = localStorage.getItem(TUTOR_STUDENT_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StudentDraftPayload;
      if (!parsed || typeof parsed !== 'object' || !parsed.form) return null;
      return {
        form: {
          ...createEmptyStudentForm(schoolId),
          ...parsed.form,
          school_id: schoolId || parsed.form.school_id || '',
        },
        step: Math.min(3, Math.max(1, Number(parsed.step) || 1)),
      };
    } catch {
      return null;
    }
  };

  const readScheduleDraft = (): ScheduleDraftPayload | null => {
    try {
      const raw = localStorage.getItem(TUTOR_SCHEDULE_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ScheduleDraftPayload;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        schoolId: parsed.schoolId || '',
        studentId: parsed.studentId || '',
        studentIds: Array.isArray(parsed.studentIds)
          ? parsed.studentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : (parsed.studentId ? [parsed.studentId] : []),
        lessonId: parsed.lessonId || '',
        title: parsed.title || '',
        date: parsed.date || new Date().toISOString().split('T')[0],
        start: parsed.start || '09:00',
        end: parsed.end || '10:00',
        notes: parsed.notes || '',
        recurWeeks: Math.max(0, Number(parsed.recurWeeks) || 0),
        step: Math.min(3, Math.max(1, Number(parsed.step) || 1)),
      };
    } catch {
      return null;
    }
  };

  const readNoteDraft = (): NoteDraftPayload | null => {
    try {
      const raw = localStorage.getItem(TUTOR_NOTE_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as NoteDraftPayload;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        studentId: parsed.studentId || '',
        note: parsed.note || '',
        date: parsed.date || new Date().toISOString().split('T')[0],
      };
    } catch {
      return null;
    }
  };

  const readDoneNoteDraft = (): DoneNoteDraftPayload | null => {
    try {
      const raw = localStorage.getItem(TUTOR_DONE_NOTE_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DoneNoteDraftPayload;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        sessionId: parsed.sessionId || '',
        note: parsed.note || '',
        date: parsed.date || new Date().toISOString().split('T')[0],
      };
    } catch {
      return null;
    }
  };

  const dismissOnboardingTip = () => {
    localStorage.setItem(TUTOR_ONBOARDING_KEY, 'dismissed');
    setShowOnboardingTip(false);
  };

  const resetStudentForm = (schoolId = '') => {
    setEditingStudentId(null);
    setStudentForm(createEmptyStudentForm(schoolId));
    setStudentFormTouched({
      name: false,
      email: false,
      grade: false,
      age: false,
      learner_pin: false,
      parent_id: false,
      teacher_id: false,
      school_id: false,
    });
    setStudentSubmitAttempted(false);
    setStudentWizardStep(1);
  };

  const openStudentModal = (schoolId = '') => {
    setEditingStudentId(null);
    setModalPreschoolId(schoolId);
    const draft = readStudentDraft(schoolId);
    if (draft) {
      setStudentForm(draft.form);
      setStudentWizardStep(draft.step);
      setStudentSubmitAttempted(false);
      setStudentFormTouched({
        name: false,
        email: false,
        grade: false,
        age: false,
        learner_pin: false,
        parent_id: false,
        teacher_id: false,
        school_id: false,
      });
    } else {
      resetStudentForm(schoolId);
    }
    setShowStudentModal(true);
  };

  const openEditStudentModal = (student: Student) => {
    setEditingStudentId(student.id);
    setModalPreschoolId(student.school_id || '');
    setStudentForm({
      name: student.name || '',
      email: student.email || '',
      grade: student.grade ? String(student.grade) : '',
      age: student.age ? String(student.age) : '',
      learner_pin: '',
      parent_id: student.parent_id || '',
      teacher_id: student.teacher_id || '',
      school_id: student.school_id || '',
    });
    setStudentFormTouched({
      name: false,
      email: false,
      grade: false,
      age: false,
      learner_pin: false,
      parent_id: false,
      teacher_id: false,
      school_id: false,
    });
    setStudentSubmitAttempted(false);
    setStudentWizardStep(1);
    setShowStudentModal(true);
  };

  const closeStudentModal = () => {
    setShowStudentModal(false);
    setModalPreschoolId('');
    resetStudentForm('');
  };

  const updateStudentFormField = (field: StudentFormField, value: string) => {
    setStudentForm(prev => ({ ...prev, [field]: value }));
    setStudentFormTouched(prev => ({ ...prev, [field]: true }));
  };

  useEffect(() => {
    if (authLoading) return;
    fetchData(false);
    fetchSchedule(false);
    fetchStudentLessons(false);
    fetchOperationsOverview();
    fetchCalendarIntegrations();
  }, [authLoading]);

  useEffect(() => {
    if (!showProfileModal || !profileStudentId) return;
    const learner = students.find(student => student.id === profileStudentId);
    if (!learner) return;
    setProfileSchoolId(learner.school_id || '');
    setProfileTeacherId(learner.teacher_id || '');
    setProfileParentId(learner.parent_id || '');
  }, [showProfileModal, profileStudentId, students]);

  useEffect(() => {
    const optionIds = [
      ...schools.map(school => school.id),
      ...(students.some(student => !student.school_id) ? [UNASSIGNED_SCHOOL_SCOPE_ID] : []),
    ];
    if (optionIds.length === 0) {
      if (rosterSchoolId) setRosterSchoolId('');
      return;
    }
    if (!optionIds.includes(rosterSchoolId)) {
      setRosterSchoolId(optionIds[0]);
    }
  }, [schools, students, rosterSchoolId]);

  useEffect(() => {
    if (schedSchoolFilterId === ALL_SCHOOL_SCOPE_ID) return;
    const optionIds = [
      ...schools.map(school => school.id),
      ...(students.some(student => !student.school_id) ? [UNASSIGNED_SCHOOL_SCOPE_ID] : []),
    ];
    if (!optionIds.includes(schedSchoolFilterId)) {
      setSchedSchoolFilterId(ALL_SCHOOL_SCOPE_ID);
    }
  }, [schools, students, schedSchoolFilterId]);

  useEffect(() => {
    if (!schedCalendarDate) return;
    if (!schedCalendarDate.startsWith(`${schedCalendarMonth}-`)) {
      setSchedCalendarDate('');
    }
  }, [schedCalendarMonth, schedCalendarDate]);

  useEffect(() => {
    if (authLoading || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('calendarProvider') as CalendarProvider | null;
    const status = params.get('calendarStatus');
    const message = params.get('calendarMessage');

    if (!provider || !status || !isCalendarProvider(provider)) return;

    if (status === 'connected') {
      setCalendarNotice({
        kind: 'success',
        text: `${CALENDAR_PROVIDER_LABELS[provider]} linked successfully.`,
      });
      fetchCalendarIntegrations();
    } else if (status === 'error') {
      setCalendarNotice({
        kind: 'error',
        text: message || `Could not link ${CALENDAR_PROVIDER_LABELS[provider]}.`,
      });
    }

    params.delete('calendarProvider');
    params.delete('calendarStatus');
    params.delete('calendarMessage');
    const nextQuery = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
    );
  }, [authLoading]);

  useEffect(() => {
    try {
      const rawFilters = localStorage.getItem(TUTOR_FILTERS_KEY);
      if (rawFilters) {
        const parsed = JSON.parse(rawFilters);
        if (typeof parsed.activeSection === 'string') {
          const nextSection =
            parsed.activeSection === 'students'
              ? 'learners'
              : parsed.activeSection === 'notifications'
                ? 'lessons'
                : parsed.activeSection;
          setActiveSection(nextSection);
        }
        if (parsed.schedFilter) setSchedFilter(parsed.schedFilter);
        if (typeof parsed.studentSearch === 'string') setStudentSearch(parsed.studentSearch);
      }
      const studentDraft = readStudentDraft();
      if (studentDraft) {
        setStudentForm(studentDraft.form);
        setStudentWizardStep(studentDraft.step);
      }

      const scheduleDraft = readScheduleDraft();
      if (scheduleDraft) {
        setSchedSchoolId(scheduleDraft.schoolId || '');
        setSchedStudentId(scheduleDraft.studentId || scheduleDraft.studentIds[0] || '');
        setSchedStudentIds(scheduleDraft.studentIds.length > 0 ? scheduleDraft.studentIds : (scheduleDraft.studentId ? [scheduleDraft.studentId] : []));
        setSchedLessonId(scheduleDraft.lessonId);
        setSchedTitle(scheduleDraft.title);
        setSchedDate(scheduleDraft.date);
        setSchedStart(scheduleDraft.start);
        setSchedEnd(scheduleDraft.end);
        setSchedNotes(scheduleDraft.notes);
        setSchedRecurWeeks(scheduleDraft.recurWeeks);
        setSchedWizardStep(scheduleDraft.step);
      }

      const noteDraft = readNoteDraft();
      if (noteDraft) {
        setNotesStudentId(noteDraft.studentId);
        setNoteText(noteDraft.note);
        setNoteDate(noteDraft.date);
      }

      const doneNoteDraft = readDoneNoteDraft();
      if (doneNoteDraft) {
        setDoneSessionId(doneNoteDraft.sessionId);
        setDoneNoteText(doneNoteDraft.note);
        setDoneNoteDate(doneNoteDraft.date);
      }
    } catch {
      // Ignore malformed localStorage values
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      TUTOR_FILTERS_KEY,
      JSON.stringify({
        activeSection,
        schedFilter,
        studentSearch,
      })
    );
  }, [activeSection, schedFilter, studentSearch]);

  useEffect(() => {
    if (!showStudentModal || editingStudentId) return;
    const payload: StudentDraftPayload = {
      form: studentForm,
      step: studentWizardStep,
    };
    localStorage.setItem(TUTOR_STUDENT_DRAFT_KEY, JSON.stringify(payload));
  }, [showStudentModal, editingStudentId, studentForm, studentWizardStep]);

  useEffect(() => {
    if (!showSchedModal || !!editingSession) return;
    const payload: ScheduleDraftPayload = {
      schoolId: schedSchoolId,
      studentId: schedStudentId,
      studentIds: schedStudentIds,
      lessonId: schedLessonId,
      title: schedTitle,
      date: schedDate,
      start: schedStart,
      end: schedEnd,
      notes: schedNotes,
      recurWeeks: schedRecurWeeks,
      step: schedWizardStep,
    };
    localStorage.setItem(TUTOR_SCHEDULE_DRAFT_KEY, JSON.stringify(payload));
  }, [showSchedModal, editingSession, schedSchoolId, schedStudentId, schedStudentIds, schedLessonId, schedTitle, schedDate, schedStart, schedEnd, schedNotes, schedRecurWeeks, schedWizardStep]);

  useEffect(() => {
    if (!showNotesModal) return;
    const payload: NoteDraftPayload = {
      studentId: notesStudentId,
      note: noteText,
      date: noteDate,
    };
    localStorage.setItem(TUTOR_NOTE_DRAFT_KEY, JSON.stringify(payload));
  }, [showNotesModal, notesStudentId, noteText, noteDate]);

  useEffect(() => {
    if (!showDoneModal) return;
    const payload: DoneNoteDraftPayload = {
      sessionId: doneSessionId,
      note: doneNoteText,
      date: doneNoteDate,
    };
    localStorage.setItem(TUTOR_DONE_NOTE_DRAFT_KEY, JSON.stringify(payload));
  }, [showDoneModal, doneSessionId, doneNoteText, doneNoteDate]);

  const fetchOperationsOverview = async () => {
    setOperationsOverviewLoading(true);
    try {
      const res = await axios.get(`${API_URL}/analytics/operations-overview`);
      const payload = res.data as OperationsOverviewPayload;
      setOperationsOverview(payload);
      setOperationsOverviewError('');
    } catch (error: any) {
      console.error('Error fetching operations overview:', error);
      setOperationsOverview(null);
      setOperationsOverviewError(
        error?.response?.data?.error || 'Could not load operations overview from platform records.'
      );
    } finally {
      setOperationsOverviewLoading(false);
    }
  };

  const fetchSchedule = async (refreshOperations = true) => {
    setSchedLoading(true);
    try {
      const res = await axios.get(`${API_URL}/schedule`);
      setSchedule(res.data || []);
    } catch {
      setSchedule([]);
    } finally {
      setSchedLoading(false);
      if (refreshOperations) {
        await fetchOperationsOverview();
      }
    }
  };

  const fetchCalendarIntegrations = async () => {
    setCalendarIntegrationsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/calendar-integrations`);
      setCalendarIntegrations(Array.isArray(response.data?.providers) ? response.data.providers : []);
    } catch {
      setCalendarIntegrations([]);
    } finally {
      setCalendarIntegrationsLoading(false);
    }
  };

  const handleConnectCalendar = async (provider: CalendarProvider) => {
    setCalendarActionProvider(provider);
    setCalendarNotice(null);
    try {
      const response = await axios.post(`${API_URL}/calendar-integrations/${provider}/connect`);
      const authUrl = response.data?.auth_url;
      if (typeof authUrl !== 'string' || authUrl.length === 0) {
        throw new Error('Server did not return an authorization URL.');
      }
      window.location.assign(authUrl);
    } catch (error: any) {
      setCalendarNotice({
        kind: 'error',
        text: error.response?.data?.error || error.message || `Could not start ${CALENDAR_PROVIDER_LABELS[provider]} linking.`,
      });
    } finally {
      setCalendarActionProvider('');
    }
  };

  const handleDisconnectCalendar = async (provider: CalendarProvider) => {
    setCalendarActionProvider(provider);
    setCalendarNotice(null);
    try {
      await axios.delete(`${API_URL}/calendar-integrations/${provider}`);
      await fetchCalendarIntegrations();
      setCalendarNotice({
        kind: 'success',
        text: `${CALENDAR_PROVIDER_LABELS[provider]} disconnected.`,
      });
    } catch (error: any) {
      setCalendarNotice({
        kind: 'error',
        text: error.response?.data?.error || error.message || `Could not disconnect ${CALENDAR_PROVIDER_LABELS[provider]}.`,
      });
    } finally {
      setCalendarActionProvider('');
    }
  };

  const fetchStudentLessons = async (refreshOperations = true) => {
    try {
      const res = await axios.get(`${API_URL}/student-lessons`);
      setStudentLessons(res.data || []);
    } catch {
      setStudentLessons([]);
    } finally {
      if (refreshOperations) {
        await fetchOperationsOverview();
      }
    }
  };

  const fetchData = async (refreshOperations = true) => {
    try {
      const [studentsRes, gamesRes, lessonsRes, progressRes, schoolsRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/students`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/games`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/lessons`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/progress/all`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/schools`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/users`).catch(() => ({ data: [] }))
      ]);
      setStudents(studentsRes.data || []);
      setGames(gamesRes.data || []);
      setLessons(lessonsRes.data || []);
      setProgress(progressRes.data || []);
      setSchools(schoolsRes.data || []);
      setTeachers((usersRes.data || []).filter((u: User) => u.role === 'teacher'));
      setParents((usersRes.data || []).filter((u: User) => u.role === 'parent'));
    } catch (error) {
      console.error('Error fetching data:', error);
      // Set empty arrays on error to prevent crashes
      setStudents([]);
      setGames([]);
      setLessons([]);
      setProgress([]);
      setSchools([]);
      setTeachers([]);
      setParents([]);
    } finally {
      setLoading(false);
      if (refreshOperations) {
        await fetchOperationsOverview();
      }
    }
  };

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStudentSubmitAttempted(true);
    if (!isStudentFormValid) return;

    setStudentSubmitting(true);
    try {
      const payload = {
        name: studentForm.name.trim(),
        email: studentForm.email.trim() || null,
        grade: parseInt(studentForm.grade, 10),
        age: parseInt(studentForm.age, 10),
        learner_pin: studentForm.learner_pin.trim() || undefined,
        parent_id: studentForm.parent_id || null,
        teacher_id: studentForm.teacher_id || null,
        school_id: studentForm.school_id || null,
      };

      if (editingStudentId) {
        await axios.put(`${API_URL}/students/${editingStudentId}`, payload);
      } else {
        await axios.post(`${API_URL}/students`, payload);
      }

      localStorage.removeItem(TUTOR_STUDENT_DRAFT_KEY);
      closeStudentModal();
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || `Failed to ${editingStudentId ? 'update' : 'add'} learner`, {
        title: 'Could Not Save Learner',
        tone: 'danger',
      });
    } finally {
      setStudentSubmitting(false);
    }
  };

  const sortSessions = (items: SessionEntry[]) =>
    [...items].sort((a, b) =>
      `${a.session_date} ${a.start_time}`.localeCompare(`${b.session_date} ${b.start_time}`)
    );

  const queueUndoAction = (
    message: string,
    commit: () => Promise<void>,
    rollback: () => void
  ) => {
    if (pendingUndoAction) {
      window.clearTimeout(pendingUndoAction.timeoutId);
      void pendingUndoAction.commit();
      setPendingUndoAction(null);
    }

    const actionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeoutId = window.setTimeout(() => {
      setPendingUndoAction(current => {
        if (!current || current.id !== actionId) return current;
        void current.commit();
        return null;
      });
    }, 5000);

    setPendingUndoAction({
      id: actionId,
      message,
      timeoutId,
      commit,
      rollback,
    });
  };

  const undoPendingAction = () => {
    setPendingUndoAction(current => {
      if (!current) return null;
      window.clearTimeout(current.timeoutId);
      current.rollback();
      return null;
    });
  };

  const requestConfirmation = (options: ConfirmDialogOptions): Promise<boolean> =>
    new Promise(resolve => {
      if (confirmDialogResolverRef.current) {
        confirmDialogResolverRef.current(false);
      }
      confirmDialogResolverRef.current = resolve;
      setConfirmDialog({
        isOpen: true,
        title: options.title || 'Confirm Action',
        message: options.message,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        tone: options.tone || 'default',
      });
    });

  const resolveConfirmation = (confirmed: boolean) => {
    const resolve = confirmDialogResolverRef.current;
    confirmDialogResolverRef.current = null;
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    if (resolve) resolve(confirmed);
  };

  const showNoticeDialog = (message: string, options: NoticeDialogOptions = {}) => {
    setNoticeDialog({
      isOpen: true,
      title: options.title || 'Notice',
      message,
      tone: options.tone || 'default',
      dismissLabel: options.dismissLabel || 'Close',
    });
  };

  const closeNoticeDialog = () => {
    setNoticeDialog(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => () => {
    if (confirmDialogResolverRef.current) {
      confirmDialogResolverRef.current(false);
      confirmDialogResolverRef.current = null;
    }
  }, []);

  const createEmptyGameForm = (): GameFormState => ({
    title: '',
    description: '',
    category: '',
    difficulty_level: '1',
    game_url: '',
    thumbnail_url: '',
    instructions: '',
    tracking_enabled: true,
  });

  const createEmptyLessonForm = (): LessonFormState => ({
    title: '',
    description: '',
    thumbnail_url: '',
    lesson_content: createEmptyLessonContent(),
    station_1_game_id: '',
    station_2_game_id: '',
    station_3_game_id: '',
  });

  const openGameModal = (game?: Game) => {
    if (game) {
      setEditingGameId(game.id);
      setGameForm({
        title: game.title || '',
        description: game.description || '',
        category: game.category || '',
        difficulty_level: String(game.difficulty_level || 1),
        game_url: game.game_url || '',
        thumbnail_url: game.thumbnail_url || '',
        instructions: game.instructions || '',
        tracking_enabled: game.tracking_enabled !== false,
      });
    } else {
      setEditingGameId(null);
      setGameForm(createEmptyGameForm());
    }
    setShowGameModal(true);
  };

  const closeGameModal = () => {
    setShowGameModal(false);
    setEditingGameId(null);
    setGameForm(createEmptyGameForm());
  };

  const openLessonModal = (lesson?: Lesson) => {
    if (lesson) {
      const parsedContent = parseLessonContentJson(lesson.lesson_content_json) || createEmptyLessonContent();
      setEditingLessonId(lesson.id);
      setLessonForm({
        title: lesson.title || '',
        description: lesson.description || '',
        thumbnail_url: lesson.thumbnail_url || '',
        lesson_content: {
          ...parsedContent,
          richContentHtml: createLessonHtmlFromLegacyContent(parsedContent),
        },
        station_1_game_id: lesson.station_1_game_id || '',
        station_2_game_id: lesson.station_2_game_id || '',
        station_3_game_id: lesson.station_3_game_id || '',
      });
    } else {
      setEditingLessonId(null);
      setLessonForm(createEmptyLessonForm());
    }
    setShowLessonModal(true);
  };

  const closeLessonModal = () => {
    setShowLessonModal(false);
    setEditingLessonId(null);
    setLessonForm(createEmptyLessonForm());
  };

  const openLessonDetailModal = (lessonId: string) => {
    setLessonDetailId(lessonId);
    setShowLessonDetailModal(true);
  };

  const closeLessonDetailModal = () => {
    setShowLessonDetailModal(false);
    setLessonDetailId('');
  };

  const handleGameThumbnailChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showNoticeDialog('Select a valid image file (PNG, JPG, WEBP, or GIF).', {
        title: 'Invalid Thumbnail',
        tone: 'danger',
      });
      event.target.value = '';
      return;
    }

    if (file.size > MAX_GAME_THUMBNAIL_BYTES) {
      showNoticeDialog('Thumbnail image must be 350 KB or smaller.', {
        title: 'Thumbnail Too Large',
        tone: 'danger',
      });
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setGameForm(prev => ({ ...prev, thumbnail_url: dataUrl }));
    } catch {
      showNoticeDialog('Could not read the selected image. Please try another file.', {
        title: 'Upload Error',
        tone: 'danger',
      });
      event.target.value = '';
    }
  };

  const handleLessonThumbnailChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showNoticeDialog('Select a valid image file (PNG, JPG, WEBP, or GIF).', {
        title: 'Invalid Thumbnail',
        tone: 'danger',
      });
      event.target.value = '';
      return;
    }

    if (file.size > MAX_LESSON_THUMBNAIL_BYTES) {
      showNoticeDialog('Thumbnail image must be 3 MB or smaller.', {
        title: 'Thumbnail Too Large',
        tone: 'danger',
      });
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLessonForm(prev => ({ ...prev, thumbnail_url: dataUrl }));
    } catch {
      showNoticeDialog('Could not read the selected image. Please try another file.', {
        title: 'Upload Error',
        tone: 'danger',
      });
      event.target.value = '';
    }
  };

  const updateLessonContentField = (field: keyof LessonContentData, value: string) => {
    setLessonForm(prev => ({
      ...prev,
      lesson_content: {
        ...prev.lesson_content,
        [field]: value,
      },
    }));
  };

  const updateLessonContentListItem = (
    field: 'goals' | 'checklist' | 'stationGuidance',
    index: number,
    value: string
  ) => {
    setLessonForm(prev => {
      const nextItems = [...prev.lesson_content[field]];
      nextItems[index] = value;
      return {
        ...prev,
        lesson_content: {
          ...prev.lesson_content,
          [field]: nextItems as LessonContentData[typeof field],
        },
      };
    });
  };

  const handleSaveGame = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const thumbnailUrl = gameForm.thumbnail_url.trim();
    if (!editingGameId && !thumbnailUrl) {
      showNoticeDialog('A thumbnail image is required when creating a game.', {
        title: 'Thumbnail Required',
        tone: 'danger',
      });
      return;
    }

    try {
      const payload = {
        title: gameForm.title.trim(),
        description: gameForm.description.trim() || null,
        category: gameForm.category,
        difficulty_level: parseInt(gameForm.difficulty_level, 10) || 1,
        game_url: gameForm.game_url.trim() || null,
        thumbnail_url: thumbnailUrl || null,
        instructions: gameForm.instructions.trim() || null,
        tracking_enabled: gameForm.tracking_enabled,
      };
      if (editingGameId) {
        await axios.put(`${API_URL}/games/${editingGameId}`, payload);
      } else {
        await axios.post(`${API_URL}/games`, payload);
      }
      closeGameModal();
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || `Failed to ${editingGameId ? 'update' : 'add'} game`, {
        title: 'Could Not Save Game',
        tone: 'danger',
      });
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    const confirmed = await requestConfirmation({
      title: 'Remove Game',
      message: 'Remove this game from the library?',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/games/${gameId}`);
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to delete game', {
        title: 'Could Not Delete Game',
        tone: 'danger',
      });
    }
  };

  const handleSaveLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const thumbnailUrl = lessonForm.thumbnail_url.trim();
    if (!editingLessonId && !thumbnailUrl) {
      showNoticeDialog('A thumbnail image is required when creating a lesson.', {
        title: 'Thumbnail Required',
        tone: 'danger',
      });
      return;
    }
    try {
      const payload = {
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim() || null,
        thumbnail_url: thumbnailUrl || null,
        lesson_content_json: serializeLessonContentJson(lessonForm.lesson_content),
        station_1_game_id: lessonForm.station_1_game_id || null,
        station_2_game_id: lessonForm.station_2_game_id || null,
        station_3_game_id: lessonForm.station_3_game_id || null,
      };
      if (editingLessonId) {
        await axios.put(`${API_URL}/lessons/${editingLessonId}`, payload);
      } else {
        await axios.post(`${API_URL}/lessons`, payload);
      }
      closeLessonModal();
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || `Failed to ${editingLessonId ? 'update' : 'add'} lesson`, {
        title: 'Could Not Save Lesson',
        tone: 'danger',
      });
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const confirmed = await requestConfirmation({
      title: 'Delete Lesson',
      message: 'Delete this lesson?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/lessons/${lessonId}`);
      await fetchData();
      await fetchStudentLessons();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to delete lesson', {
        title: 'Could Not Delete Lesson',
        tone: 'danger',
      });
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    const confirmed = await requestConfirmation({
      title: 'Remove Learner',
      message: `Remove learner "${student.name}"? This action cannot be undone.`,
      confirmLabel: 'Remove Learner',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/students/${student.id}`);
      if (profileStudentId === student.id) {
        setShowProfileModal(false);
        setProfileStudentId('');
      }
      await Promise.all([fetchData(false), fetchSchedule(false), fetchStudentLessons(false)]);
      await fetchOperationsOverview();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to delete learner', {
        title: 'Could Not Delete Learner',
        tone: 'danger',
      });
    }
  };

  const handleDeleteSchool = async (school: School) => {
    const confirmed = await requestConfirmation({
      title: 'Remove School',
      message: `Remove school "${school.name}"?`,
      confirmLabel: 'Remove School',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/schools/${school.id}`);
      if (schoolDetailId === school.id) {
        setShowSchoolDetailModal(false);
        setSchoolDetailId('');
      }
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to delete school', {
        title: 'Could Not Delete School',
        tone: 'danger',
      });
    }
  };

  const handleDeleteUser = async (userId: string, roleLabel: 'teacher' | 'parent') => {
    const roleTitle = roleLabel === 'teacher' ? 'Teacher' : 'Parent';
    const confirmed = await requestConfirmation({
      title: `Remove ${roleTitle}`,
      message: `Remove this ${roleLabel}?`,
      confirmLabel: `Remove ${roleTitle}`,
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/users/${userId}`);
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || `Failed to delete ${roleLabel}`, {
        title: `Could Not Delete ${roleTitle}`,
        tone: 'danger',
      });
    }
  };

  const handleSeedDatabase = async () => {
    const confirmed = await requestConfirmation({
      title: 'Load Sample Data',
      message: 'This will add sample learners, games, lessons, and progress data. Continue?',
      confirmLabel: 'Load Data',
    });
    if (!confirmed) {
      return;
    }
    setSeeding(true);
    try {
      await axios.post(`${API_URL}/seed`);
      showNoticeDialog('Sample data loaded successfully.', {
        title: 'Sample Data Loaded',
        tone: 'success',
      });
      fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to load sample data', {
        title: 'Could Not Load Sample Data',
        tone: 'danger',
      });
    } finally {
      setSeeding(false);
    }
  };

  // ── Lesson assignment handlers ────────────────────────────
  const handleAssignLesson = async (studentId: string, lessonId: string) => {
    if (!lessonId) return false;
    try {
      await axios.post(`${API_URL}/student-lessons`, { student_id: studentId, lesson_id: lessonId });
      fetchStudentLessons();
      return true;
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to assign lesson', {
        title: 'Could Not Assign Lesson',
        tone: 'danger',
      });
      return false;
    }
  };

  const handleUnassignLesson = async (studentId: string, lessonId: string) => {
    try {
      await axios.delete(`${API_URL}/student-lessons`, { data: { student_id: studentId, lesson_id: lessonId } });
      fetchStudentLessons();
      return true;
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to unassign lesson', {
        title: 'Could Not Unassign Lesson',
        tone: 'danger',
      });
      return false;
    }
  };

  const handleAddLessonSelection = async (studentId: string, lessonId: string) => {
    if (!lessonId) return;
    const alreadyAssigned = studentLessons.some(
      assignment => assignment.student_id === studentId && assignment.lesson_id === lessonId
    );
    if (alreadyAssigned) {
      setLessonAssignmentErrors(prev => ({
        ...prev,
        [studentId]: 'This lesson is already assigned to this learner.',
      }));
      return;
    }

    setLessonAssignmentErrors(prev => ({ ...prev, [studentId]: '' }));
    setLessonAssignmentSavingId(studentId);
    const success = await handleAssignLesson(studentId, lessonId);
    if (!success) {
      setLessonAssignmentErrors(prev => ({
        ...prev,
        [studentId]: 'Could not update lesson assignment. Try again.',
      }));
    }
    setLessonAssignmentSavingId(null);
  };

  const handleRemoveLessonSelection = (studentId: string, assignment: StudentLesson) => {
    setLessonAssignmentErrors(prev => ({ ...prev, [studentId]: '' }));
    const existingAssignment = studentLessons.find(
      current =>
        current.student_id === studentId &&
        current.lesson_id === assignment.lesson_id &&
        current.id === assignment.id
    );
    if (!existingAssignment) {
      setLessonAssignmentErrors(prev => ({
        ...prev,
        [studentId]: 'Could not update lesson assignment. Try again.',
      }));
      return;
    }

    setLessonAssignmentSavingId(studentId);
    setStudentLessons(prev =>
      prev.filter(
        current => !(current.student_id === studentId && current.lesson_id === assignment.lesson_id)
      )
    );
    queueUndoAction(
      `Unassigned ${assignment.lesson_title || 'lesson'} from ${students.find(student => student.id === studentId)?.name || 'learner'}.`,
      async () => {
        const committed = await handleUnassignLesson(studentId, assignment.lesson_id);
        if (!committed) {
          setLessonAssignmentErrors(prev => ({
            ...prev,
            [studentId]: 'Could not unassign lesson. Try again.',
          }));
          fetchStudentLessons();
        }
      },
      () => {
        setStudentLessons(prev => [...prev, existingAssignment]);
      }
    );
    setLessonAssignmentSavingId(null);
  };

  // ── Student profile modal ─────────────────────────────────
  const openProfileModal = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    setProfileSchoolId(student?.school_id || '');
    setProfileTeacherId(student?.teacher_id || '');
    setProfileParentId(student?.parent_id || '');
    setProfileStudentId(studentId);
    setShowProfileModal(true);
    setProfileLoading(true);
    try {
      const [progRes, notesRes] = await Promise.all([
        axios.get(`${API_URL}/progress/student/${studentId}`),
        axios.get(`${API_URL}/notes/student/${studentId}`),
      ]);
      setProfileProgress(progRes.data || []);
      setProfileNotes(notesRes.data || []);
    } catch {
      setProfileProgress([]);
      setProfileNotes([]);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSaveProfileLinks = async () => {
    if (!profileStudentId) return;
    setProfileSavingLinks(true);
    try {
      await axios.put(`${API_URL}/students/${profileStudentId}`, {
        school_id: profileSchoolId || null,
        teacher_id: profileTeacherId || null,
        parent_id: profileParentId || null,
      });
      await fetchData();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to update learner links', {
        title: 'Could Not Save Learner Links',
        tone: 'danger',
      });
    } finally {
      setProfileSavingLinks(false);
    }
  };

  // ── Mark done with note ───────────────────────────────────
  const openDoneModal = (sessionId: string, sessionDate: string) => {
    const draft = readDoneNoteDraft();
    setDoneSessionId(sessionId);
    if (draft && draft.sessionId === sessionId) {
      setDoneNoteDate(draft.date || sessionDate);
      setDoneNoteText(draft.note || '');
    } else {
      setDoneNoteDate(sessionDate);
      setDoneNoteText('');
    }
    setShowDoneModal(true);
  };

  const handleMarkDoneWithNote = async () => {
    try {
      await axios.put(`${API_URL}/schedule/${doneSessionId}`, { status: 'completed' });
      if (doneNoteText.trim()) {
        const session = schedule.find(s => s.id === doneSessionId);
        await axios.post(`${API_URL}/notes`, {
          student_id: session?.student_id,
          note: doneNoteText.trim(),
          session_date: doneNoteDate,
          session_id: doneSessionId,
        });
      }
      setSchedule(prev => prev.map(s => s.id === doneSessionId ? { ...s, status: 'completed' } : s));
      setShowDoneModal(false);
      localStorage.removeItem(TUTOR_DONE_NOTE_DRAFT_KEY);
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to mark session complete', {
        title: 'Could Not Complete Session',
        tone: 'danger',
      });
    }
  };

  // ── Notes handlers ────────────────────────────────────────────
  const openNotesModal = async (studentId: string) => {
    const draft = readNoteDraft();
    setNotesStudentId(studentId);
    if (draft && draft.studentId === studentId) {
      setNoteText(draft.note || '');
      setNoteDate(draft.date || new Date().toISOString().split('T')[0]);
    } else {
      setNoteText('');
      setNoteDate(new Date().toISOString().split('T')[0]);
    }
    setEditingNoteId(null);
    setShowNotesModal(true);
    setNotesLoading(true);
    try {
      const res = await axios.get(`${API_URL}/notes/student/${studentId}`);
      setNotes(res.data);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    try {
      if (editingNoteId) {
        await axios.put(`${API_URL}/notes/${editingNoteId}`, { note: noteText, session_date: noteDate });
      } else {
        await axios.post(`${API_URL}/notes`, { student_id: notesStudentId, note: noteText, session_date: noteDate });
      }
      setNoteText('');
      setNoteDate(new Date().toISOString().split('T')[0]);
      setEditingNoteId(null);
      localStorage.removeItem(TUTOR_NOTE_DRAFT_KEY);
      const res = await axios.get(`${API_URL}/notes/student/${notesStudentId}`);
      setNotes(res.data);
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to save note', {
        title: 'Could Not Save Note',
        tone: 'danger',
      });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const confirmed = await requestConfirmation({
      title: 'Delete Note',
      message: 'Delete this note?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`${API_URL}/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to delete note', {
        title: 'Could Not Delete Note',
        tone: 'danger',
      });
    }
  };

  const handleEditNote = (note: TutorNote) => {
    setEditingNoteId(note.id);
    setNoteText(note.note);
    setNoteDate(note.session_date);
  };

  // ── Schedule handlers ─────────────────────────────────────
  const openSchedModal = (session?: SessionEntry, preferredSchoolScopeId?: string) => {
    setScheduleSubmitAttempted(false);
    setSchedWizardStep(1);
    const availableSchoolScopeIds = [
      ...schools.map(school => school.id),
      ...(students.some(student => !student.school_id) ? [UNASSIGNED_SCHOOL_SCOPE_ID] : []),
    ];
    if (session) {
      const sessionSchoolScope = getSchoolScopeForStudent(session.student_id);
      setEditingSession(session);
      setSchedSchoolId(sessionSchoolScope || availableSchoolScopeIds[0] || '');
      setSchedStudentId(session.student_id);
      setSchedStudentIds([session.student_id]);
      setSchedLessonId(session.lesson_id || '');
      setSchedTitle(session.title || '');
      setSchedDate(session.session_date);
      setSchedStart(session.start_time);
      setSchedEnd(session.end_time || '');
      setSchedNotes(session.notes || '');
      setSchedRecurWeeks(0);
    } else {
      const draft = readScheduleDraft();
      const initialSchoolScopeId =
        (draft?.schoolId && availableSchoolScopeIds.includes(draft.schoolId) ? draft.schoolId : '') ||
        (preferredSchoolScopeId && availableSchoolScopeIds.includes(preferredSchoolScopeId) ? preferredSchoolScopeId : '') ||
        availableSchoolScopeIds[0] ||
        '';
      const schoolLearners = getStudentsForSchoolScope(initialSchoolScopeId);
      const draftStudentIds = draft?.studentIds?.length
        ? draft.studentIds.filter(studentId => schoolLearners.some(student => student.id === studentId))
        : draft?.studentId && schoolLearners.some(student => student.id === draft.studentId)
          ? [draft.studentId]
          : [];
      const nextStudentIds =
        draftStudentIds.length > 0
          ? draftStudentIds
          : schoolLearners[0]?.id
            ? [schoolLearners[0].id]
            : [];

      setEditingSession(null);
      setSchedSchoolId(initialSchoolScopeId);
      setSchedStudentId(nextStudentIds[0] || '');
      setSchedStudentIds(nextStudentIds);
      setSchedLessonId(draft?.lessonId || '');
      setSchedTitle(draft?.title || '');
      setSchedDate(draft?.date || new Date().toISOString().split('T')[0]);
      setSchedStart(draft?.start || '09:00');
      setSchedEnd(draft?.end || '10:00');
      setSchedNotes(draft?.notes || '');
      setSchedRecurWeeks(draft?.recurWeeks || 0);
      setSchedWizardStep(draft?.step || 1);
    }
    setShowSchedModal(true);
  };

  const handleSchedSchoolChange = (schoolScopeId: string) => {
    setSchedSchoolId(schoolScopeId);
    const schoolLearners = getStudentsForSchoolScope(schoolScopeId);

    if (editingSession) {
      const nextStudentId = schoolLearners.some(student => student.id === schedStudentId)
        ? schedStudentId
        : (schoolLearners[0]?.id || '');
      setSchedStudentId(nextStudentId);
      setSchedStudentIds(nextStudentId ? [nextStudentId] : []);
      return;
    }

    const retainedSelection = schedStudentIds.filter(studentId =>
      schoolLearners.some(student => student.id === studentId)
    );
    const nextStudentIds =
      retainedSelection.length > 0
        ? retainedSelection
        : schoolLearners[0]?.id
          ? [schoolLearners[0].id]
          : [];
    setSchedStudentIds(nextStudentIds);
    setSchedStudentId(nextStudentIds[0] || '');
  };

  const toggleSchedStudent = (studentId: string) => {
    if (!schedLearnersForSchool.some(student => student.id === studentId)) return;
    setSchedStudentIds(prev => {
      const next = prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId];
      setSchedStudentId(next[0] || '');
      return next;
    });
  };

  const handleSaveSession = async () => {
    setScheduleSubmitAttempted(true);
    if (!canSaveSchedule) return;
    try {
      if (editingSession) {
        await axios.put(`${API_URL}/schedule/${editingSession.id}`, {
          student_id:   schedStudentId,
          lesson_id:    schedLessonId  || undefined,
          title:        schedTitle     || undefined,
          session_date: schedDate,
          start_time:   schedStart,
          end_time:     schedEnd       || undefined,
          notes:        schedNotes     || undefined,
        });
      } else {
        await Promise.all(
          selectedScheduleStudentIds.map(studentId =>
            axios.post(`${API_URL}/schedule`, {
              student_id: studentId,
              lesson_id:    schedLessonId  || undefined,
              title:        schedTitle     || undefined,
              session_date: schedDate,
              start_time:   schedStart,
              end_time:     schedEnd       || undefined,
              notes:        schedNotes     || undefined,
              recur_weeks:  schedRecurWeeks || undefined,
            })
          )
        );
      }
      if (!editingSession) {
        localStorage.removeItem(TUTOR_SCHEDULE_DRAFT_KEY);
      }
      setShowSchedModal(false);
      fetchSchedule();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to save session', {
        title: 'Could Not Save Session',
        tone: 'danger',
      });
    }
  };

  const handleDeleteSession = async (id: string) => {
    const confirmed = await requestConfirmation({
      title: 'Delete Session',
      message: 'Delete this session?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    const targetSession = schedule.find(s => s.id === id);
    if (!targetSession) return;

    setSchedule(prev => prev.filter(s => s.id !== id));
    queueUndoAction(
      `Deleted session for ${targetSession.student_name || 'learner'}.`,
      async () => {
        try {
          await axios.delete(`${API_URL}/schedule/${id}`);
        } catch (error: any) {
          showNoticeDialog(error.response?.data?.error || 'Failed to delete session', {
            title: 'Could Not Delete Session',
            tone: 'danger',
          });
          fetchSchedule();
        }
      },
      () => {
        setSchedule(prev => sortSessions([...prev, targetSession]));
      }
    );
  };

  const handleMarkStatus = async (id: string, status: string) => {
    try {
      await axios.put(`${API_URL}/schedule/${id}`, { status });
      setSchedule(prev => prev.map(s => s.id === id ? { ...s, status: status as SessionEntry['status'] } : s));
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to update status', {
        title: 'Could Not Update Session Status',
        tone: 'danger',
      });
    }
  };

  const handleCancelSession = (id: string) => {
    const current = schedule.find(s => s.id === id);
    if (!current || current.status === 'cancelled') return;

    setSchedule(prev => prev.map(s => (s.id === id ? { ...s, status: 'cancelled' } : s)));
    queueUndoAction(
      `Cancelled session for ${current.student_name || 'learner'}.`,
      async () => {
        try {
          await axios.put(`${API_URL}/schedule/${id}`, { status: 'cancelled' });
        } catch (error: any) {
          showNoticeDialog(error.response?.data?.error || 'Failed to cancel session', {
            title: 'Could Not Cancel Session',
            tone: 'danger',
          });
          fetchSchedule();
        }
      },
      () => {
        setSchedule(prev => prev.map(s => (s.id === id ? current : s)));
      }
    );
  };

  const handleAddSchool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await axios.post(`${API_URL}/schools`, {
        name: formData.get('name'),
        address: formData.get('address'),
        contact_email: formData.get('contact_email'),
        contact_phone: formData.get('contact_phone')
      });
      setShowSchoolModal(false);
      fetchData();
      e.currentTarget.reset();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to add school', {
        title: 'Could Not Add School',
        tone: 'danger',
      });
    }
  };

  const handleAddTeacher = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await axios.post(`${API_URL}/users`, {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        role: 'teacher',
        school_id: formData.get('school_id') || null
      });
      setShowTeacherModal(false);
      setModalPreschoolId('');
      fetchData();
      e.currentTarget.reset();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to add teacher', {
        title: 'Could Not Add Teacher',
        tone: 'danger',
      });
    }
  };

  const handleAddParent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await axios.post(`${API_URL}/users`, {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        role: 'parent',
        school_id: formData.get('school_id') || null
      });
      setShowParentModal(false);
      setModalPreschoolId('');
      fetchData();
      e.currentTarget.reset();
    } catch (error: any) {
      showNoticeDialog(error.response?.data?.error || 'Failed to add parent', {
        title: 'Could Not Add Parent',
        tone: 'danger',
      });
    }
  };

  const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const toCsv = (headers: string[], rows: Array<Array<unknown>>) => {
    return [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
  };

  const downloadTextFile = (fileName: string, content: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toPercent = (numerator: number, denominator: number): number => (
    denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
  );

  const formatDuration = (seconds: number): string => {
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
    if (safeSeconds === 0) return '0m';

    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours === 0 && minutes === 0) return '<1m';
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  const getRateTone = (percent: number): 'good' | 'warn' | 'risk' => {
    if (percent >= 80) return 'good';
    if (percent >= 60) return 'warn';
    return 'risk';
  };

  const getImprovementTone = (points: number): 'good' | 'warn' | 'risk' => {
    if (points > 0) return 'good';
    if (points === 0) return 'warn';
    return 'risk';
  };

  const getSessionStatusLabel = (status: SessionEntry['status']): string => {
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Scheduled';
  };

  type SchoolScope = {
    school_id: string;
    school_name: string;
    learner_ids: string[];
    teacher_ids: string[];
    parent_ids: string[];
  };

  const buildSchoolScopes = (): SchoolScope[] => {
    const scopes: SchoolScope[] = schools.map(school => ({
      school_id: school.id,
      school_name: school.name,
      learner_ids: students.filter(student => student.school_id === school.id).map(student => student.id),
      teacher_ids: teachers.filter(teacher => teacher.school_id === school.id).map(teacher => teacher.id),
      parent_ids: parents.filter(parent => parent.school_id === school.id).map(parent => parent.id),
    }));

    const hasUnassigned =
      students.some(student => !student.school_id) ||
      teachers.some(teacher => !teacher.school_id) ||
      parents.some(parent => !parent.school_id);

    if (hasUnassigned) {
      scopes.push({
        school_id: '__unassigned__',
        school_name: 'Unassigned / No School',
        learner_ids: students.filter(student => !student.school_id).map(student => student.id),
        teacher_ids: teachers.filter(teacher => !teacher.school_id).map(teacher => teacher.id),
        parent_ids: parents.filter(parent => !parent.school_id).map(parent => parent.id),
      });
    }

    return scopes;
  };

  const buildSchoolOutcomeRows = (): SchoolOutcomeSummaryRow[] => {
    const studentById = new Map(students.map(student => [student.id, student]));
    const today = new Date().toISOString().split('T')[0];

    return buildSchoolScopes()
      .map(scope => {
        const learnerSet = new Set(scope.learner_ids);
        const schoolSessions = schedule.filter(session => learnerSet.has(session.student_id));
        const schoolProgress = progress.filter(item => item.student_id && learnerSet.has(item.student_id));
        const schoolAssignments = studentLessons.filter(assignment => learnerSet.has(assignment.student_id));

        const sessionsCompleted = schoolSessions.filter(session => session.status === 'completed').length;
        const sessionsCancelled = schoolSessions.filter(session => session.status === 'cancelled').length;
        const sessionsUpcoming = schoolSessions.filter(
          session => session.status === 'scheduled' && session.session_date >= today
        ).length;
        const sessionsOverdue = schoolSessions.filter(
          session => session.status === 'scheduled' && session.session_date < today
        ).length;

        const attendanceDenominator = sessionsCompleted + sessionsCancelled + sessionsOverdue;
        const sessionAttendanceRate = toPercent(sessionsCompleted, attendanceDenominator);

        const parentConfirmedSessions = schoolSessions.filter(session => session.parent_confirmed === 1).length;
        const confirmableSessions = schoolSessions.filter(session => session.status !== 'cancelled').length;
        const parentConfirmationRate = toPercent(parentConfirmedSessions, confirmableSessions);

        const gameAttempts = schoolProgress.length;
        const gameCompletions = schoolProgress.filter(item => Boolean(item.completed)).length;
        const totalGameScore = schoolProgress.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
        const totalTimeSpent = schoolProgress.reduce((sum, item) => sum + Number(item.time_spent ?? 0), 0);

        const learnersWithTeacher = scope.learner_ids.filter(learnerId => Boolean(studentById.get(learnerId)?.teacher_id)).length;
        const learnersWithParent = scope.learner_ids.filter(learnerId => Boolean(studentById.get(learnerId)?.parent_id)).length;
        const learnersWithLessonPlan = new Set(schoolAssignments.map(assignment => assignment.student_id)).size;

        const activeLearners = new Set<string>([
          ...schoolSessions.map(session => session.student_id),
          ...schoolProgress
            .map(item => item.student_id || '')
            .filter((studentId): studentId is string => studentId.length > 0),
        ]);

        const activeTeachers = new Set<string>(
          Array.from(activeLearners)
            .map(learnerId => studentById.get(learnerId)?.teacher_id || '')
            .filter((teacherId): teacherId is string => teacherId.length > 0)
        );

        const activeParents = new Set<string>(
          schoolSessions
            .filter(session => session.parent_confirmed === 1)
            .map(session => studentById.get(session.student_id)?.parent_id || '')
            .filter((parentId): parentId is string => parentId.length > 0)
        );

        return {
          school_id: scope.school_id,
          school_name: scope.school_name,
          learner_enrolment: scope.learner_ids.length,
          teachers_total: scope.teacher_ids.length,
          parents_total: scope.parent_ids.length,
          learners_with_teacher: learnersWithTeacher,
          learners_with_parent: learnersWithParent,
          active_teachers: activeTeachers.size,
          active_parents: activeParents.size,
          teacher_engagement_rate: toPercent(activeTeachers.size, scope.teacher_ids.length),
          parent_engagement_rate: toPercent(activeParents.size, scope.parent_ids.length),
          sessions_total: schoolSessions.length,
          sessions_completed: sessionsCompleted,
          sessions_cancelled: sessionsCancelled,
          sessions_upcoming: sessionsUpcoming,
          sessions_overdue: sessionsOverdue,
          session_attendance_rate: sessionAttendanceRate,
          parent_confirmed_sessions: parentConfirmedSessions,
          parent_confirmation_rate: parentConfirmationRate,
          lesson_assignments_total: schoolAssignments.length,
          learners_with_lesson_plan: learnersWithLessonPlan,
          lesson_plan_coverage_rate: toPercent(learnersWithLessonPlan, scope.learner_ids.length),
          game_attempts: gameAttempts,
          game_completions: gameCompletions,
          game_completion_rate: toPercent(gameCompletions, gameAttempts),
          average_correct_percent: gameAttempts > 0 ? Math.round(totalGameScore / gameAttempts) : 0,
          total_game_time_spent_seconds: totalTimeSpent,
          average_time_per_attempt_seconds: gameAttempts > 0 ? Math.round(totalTimeSpent / gameAttempts) : 0,
        };
      })
      .sort((a, b) => a.school_name.localeCompare(b.school_name));
  };

  const buildSchoolLessonLearnerRows = (): SchoolLessonLearnerPerformanceRow[] => {
    const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
    const learnerById = new Map(students.map(student => [student.id, student]));
    const schoolByLearnerId = new Map<string, { school_id: string; school_name: string }>();
    const schoolScopes = buildSchoolScopes();

    schoolScopes.forEach(scope => {
      scope.learner_ids.forEach(learnerId => {
        schoolByLearnerId.set(learnerId, { school_id: scope.school_id, school_name: scope.school_name });
      });
    });

    const map = new Map<
      string,
      SchoolLessonLearnerPerformanceRow & {
        score_total: number;
      }
    >();

    const ensureRow = (
      schoolId: string,
      schoolName: string,
      lessonId: string,
      lessonTitle: string,
      learnerId: string,
      learnerName: string,
      grade: string
    ) => {
      const key = `${schoolId}::${lessonId}::${learnerId}`;
      const existing = map.get(key);
      if (existing) return existing;

      const created: SchoolLessonLearnerPerformanceRow & { score_total: number } = {
        school_id: schoolId,
        school_name: schoolName,
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        learner_id: learnerId,
        learner_name: learnerName,
        grade,
        games_attempted: 0,
        games_completed: 0,
        completion_rate: 0,
        average_correct_percent: 0,
        best_correct_percent: 0,
        total_attempts: 0,
        total_time_spent: 0,
        last_activity: '',
        score_total: 0,
      };

      map.set(key, created);
      return created;
    };

    studentLessons.forEach(assignment => {
      const school = schoolByLearnerId.get(assignment.student_id);
      if (!school) return;

      const learner = learnerById.get(assignment.student_id);
      const lesson = lessonById.get(assignment.lesson_id);
      const gradeValue = learner?.grade;
      const grade = gradeValue !== undefined && gradeValue !== null ? `Grade ${gradeValue}` : '';

      ensureRow(
        school.school_id,
        school.school_name,
        assignment.lesson_id,
        assignment.lesson_title || lesson?.title || 'Untitled lesson',
        assignment.student_id,
        learner?.name || assignment.student_id,
        grade
      );
    });

    progress.forEach(item => {
      const learnerId = item.student_id || '';
      const lessonId = item.lesson_id || '';
      if (!learnerId || !lessonId) return;

      const school = schoolByLearnerId.get(learnerId);
      if (!school) return;

      const learner = learnerById.get(learnerId);
      const lesson = lessonById.get(lessonId);
      const lessonTitle = item.lesson_title || lesson?.title || 'Untitled lesson';
      const learnerName = item.student_name || learner?.name || learnerId;
      const gradeValue = item.grade ?? learner?.grade;
      const grade = gradeValue !== undefined && gradeValue !== null ? `Grade ${gradeValue}` : '';

      const row = ensureRow(
        school.school_id,
        school.school_name,
        lessonId,
        lessonTitle,
        learnerId,
        learnerName,
        grade
      );

      const score = Number(item.score ?? 0);
      const attempts = Number(item.attempts ?? 0);
      const timeSpent = Number(item.time_spent ?? 0);
      const activityDate = item.updated_at || item.created_at || '';

      row.games_attempted += 1;
      if (Boolean(item.completed)) row.games_completed += 1;
      row.score_total += score;
      row.best_correct_percent = Math.max(row.best_correct_percent, score);
      row.total_attempts += attempts;
      row.total_time_spent += timeSpent;
      if (activityDate && (!row.last_activity || activityDate > row.last_activity)) {
        row.last_activity = activityDate;
      }
    });

    const rows = Array.from(map.values())
      .map(row => ({
        school_id: row.school_id,
        school_name: row.school_name,
        lesson_id: row.lesson_id,
        lesson_title: row.lesson_title,
        learner_id: row.learner_id,
        learner_name: row.learner_name,
        grade: row.grade,
        games_attempted: row.games_attempted,
        games_completed: row.games_completed,
        completion_rate: toPercent(row.games_completed, row.games_attempted),
        average_correct_percent: row.games_attempted > 0 ? Math.round(row.score_total / row.games_attempted) : 0,
        best_correct_percent: Math.round(row.best_correct_percent),
        total_attempts: row.total_attempts,
        total_time_spent: row.total_time_spent,
        last_activity: row.last_activity,
      }));

    const schoolsWithRows = new Set(rows.map(row => row.school_id));
    schoolScopes.forEach(scope => {
      if (schoolsWithRows.has(scope.school_id)) return;
      rows.push({
        school_id: scope.school_id,
        school_name: scope.school_name,
        lesson_id: '',
        lesson_title: 'No lesson activity',
        learner_id: '',
        learner_name: '',
        grade: '',
        games_attempted: 0,
        games_completed: 0,
        completion_rate: 0,
        average_correct_percent: 0,
        best_correct_percent: 0,
        total_attempts: 0,
        total_time_spent: 0,
        last_activity: '',
      });
    });

    return rows.sort((a, b) => {
        const schoolCmp = a.school_name.localeCompare(b.school_name);
        if (schoolCmp !== 0) return schoolCmp;
        const lessonCmp = a.lesson_title.localeCompare(b.lesson_title);
        if (lessonCmp !== 0) return lessonCmp;
        return a.learner_name.localeCompare(b.learner_name);
      });
  };

  const buildSchoolLessonSummaryRows = (): SchoolLessonSummaryRow[] => {
    const learnerRows = buildSchoolLessonLearnerRows().filter(row => Boolean(row.lesson_id));
    const map = new Map<
      string,
      SchoolLessonSummaryRow & {
        weighted_score_sum: number;
      }
    >();

    learnerRows.forEach(row => {
      const key = `${row.school_id}::${row.lesson_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.learners_assigned += 1;
        if (row.games_attempted > 0) existing.learners_active += 1;
        existing.games_attempted += row.games_attempted;
        existing.games_completed += row.games_completed;
        existing.total_attempts += row.total_attempts;
        existing.total_time_spent_seconds += row.total_time_spent;
        existing.weighted_score_sum += row.average_correct_percent * row.games_attempted;
        return;
      }

      map.set(key, {
        school_id: row.school_id,
        school_name: row.school_name,
        lesson_id: row.lesson_id,
        lesson_title: row.lesson_title,
        learners_assigned: 1,
        learners_active: row.games_attempted > 0 ? 1 : 0,
        games_attempted: row.games_attempted,
        games_completed: row.games_completed,
        completion_rate_percent: 0,
        average_correct_responses_percent: 0,
        total_attempts: row.total_attempts,
        total_time_spent_seconds: row.total_time_spent,
        weighted_score_sum: row.average_correct_percent * row.games_attempted,
      });
    });

    return Array.from(map.values())
      .map(row => ({
        school_id: row.school_id,
        school_name: row.school_name,
        lesson_id: row.lesson_id,
        lesson_title: row.lesson_title,
        learners_assigned: row.learners_assigned,
        learners_active: row.learners_active,
        games_attempted: row.games_attempted,
        games_completed: row.games_completed,
        completion_rate_percent: toPercent(row.games_completed, row.games_attempted),
        average_correct_responses_percent:
          row.games_attempted > 0 ? Math.round(row.weighted_score_sum / row.games_attempted) : 0,
        total_attempts: row.total_attempts,
        total_time_spent_seconds: row.total_time_spent_seconds,
      }))
      .sort((a, b) => {
        const schoolCmp = a.school_name.localeCompare(b.school_name);
        if (schoolCmp !== 0) return schoolCmp;
        return a.lesson_title.localeCompare(b.lesson_title);
      });
  };

  const buildStationImprovementRows = (): StationImprovementRow[] => {
    type StationLearnerMetric = {
      first_score: number;
      first_activity: string;
      latest_score: number;
      latest_activity: string;
      attempts: number;
      completions: number;
    };

    const categoryMaps = new Map<StationCategory, Map<string, StationLearnerMetric>>();
    STATION_CATEGORIES.forEach(category => categoryMaps.set(category, new Map()));

    progress.forEach(item => {
      const category = item.category as StationCategory;
      if (!STATION_CATEGORIES.includes(category)) return;

      const learnerKeyBase = item.student_id || item.student_name?.trim().toLowerCase() || '';
      if (!learnerKeyBase) return;
      const learnerKey = `${category}::${learnerKeyBase}`;
      const activityDate = item.updated_at || item.created_at || '';
      if (!activityDate) return;

      const score = Number(item.score ?? 0);
      const categoryMap = categoryMaps.get(category);
      if (!categoryMap) return;

      const existing = categoryMap.get(learnerKey);
      if (existing) {
        existing.attempts += 1;
        if (Boolean(item.completed)) existing.completions += 1;
        if (activityDate < existing.first_activity) {
          existing.first_activity = activityDate;
          existing.first_score = score;
        }
        if (activityDate > existing.latest_activity) {
          existing.latest_activity = activityDate;
          existing.latest_score = score;
        }
        return;
      }

      categoryMap.set(learnerKey, {
        first_score: score,
        first_activity: activityDate,
        latest_score: score,
        latest_activity: activityDate,
        attempts: 1,
        completions: Boolean(item.completed) ? 1 : 0,
      });
    });

    return STATION_CATEGORIES.map(category => {
      const categoryMap = categoryMaps.get(category);
      const metrics = categoryMap ? Array.from(categoryMap.values()) : [];
      const measured = metrics.filter(metric => metric.attempts > 1);

      const totalAttempts = metrics.reduce((sum, metric) => sum + metric.attempts, 0);
      const totalCompletions = metrics.reduce((sum, metric) => sum + metric.completions, 0);
      const baselineSum = measured.reduce((sum, metric) => sum + metric.first_score, 0);
      const latestSum = measured.reduce((sum, metric) => sum + metric.latest_score, 0);
      const improvementSum = measured.reduce((sum, metric) => sum + (metric.latest_score - metric.first_score), 0);
      const learnerCount = measured.length;

      return {
        category,
        station_label: STATION_CATEGORY_LABELS[category],
        learners_measured: learnerCount,
        total_attempts: totalAttempts,
        completion_rate: toPercent(totalCompletions, totalAttempts),
        average_baseline_score: learnerCount > 0 ? Math.round(baselineSum / learnerCount) : 0,
        average_latest_score: learnerCount > 0 ? Math.round(latestSum / learnerCount) : 0,
        average_improvement_points: learnerCount > 0 ? Math.round(improvementSum / learnerCount) : 0,
      };
    });
  };

  const getOperationsOverviewSnapshot = (): OperationsOverviewPayload | null => {
    if (!operationsOverview) {
      showNoticeDialog('Operations analytics is still syncing from platform records. Please try again in a moment.', {
        title: 'Analytics Syncing',
      });
      return null;
    }
    return operationsOverview;
  };

  const handleExportSchoolsCsv = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const rows = snapshot.school_outcomes || [];
    const csv = toCsv(
      [
        'School ID',
        'School Name',
        'Learner Enrolment',
        'Teachers',
        'Parents',
        'Learners Linked to Teacher',
        'Learners Linked to Parent',
        'Active Teachers',
        'Active Parents',
        'Teacher Engagement Rate (%)',
        'Parent Engagement Rate (%)',
        'Sessions Total',
        'Sessions Scheduled',
        'Sessions Completed',
        'Sessions Cancelled',
        'Sessions Upcoming',
        'Sessions Overdue',
        'Session Attendance Rate (%)',
        'Parent Confirmed Sessions',
        'Parent Confirmation Rate (%)',
        'Lesson Assignments',
        'Learners with Lesson Plan',
        'Lesson Plan Coverage (%)',
        'Game Attempts',
        'Game Completions',
        'Game Completion Rate (%)',
        'Average Correct Responses (%)',
        'Total Game Time Spent (sec)',
        'Average Time per Attempt (sec)',
      ],
      rows.map(row => [
        row.school_id,
        row.school_name,
        row.learner_enrolment,
        row.teachers_total,
        row.parents_total,
        row.learners_with_teacher,
        row.learners_with_parent,
        row.active_teachers,
        row.active_parents,
        row.teacher_engagement_rate,
        row.parent_engagement_rate,
        row.sessions_total,
        row.sessions_upcoming + row.sessions_overdue,
        row.sessions_completed,
        row.sessions_cancelled,
        row.sessions_upcoming,
        row.sessions_overdue,
        row.session_attendance_rate,
        row.parent_confirmed_sessions,
        row.parent_confirmation_rate,
        row.lesson_assignments_total,
        row.learners_with_lesson_plan,
        row.lesson_plan_coverage_rate,
        row.game_attempts,
        row.game_completions,
        row.game_completion_rate,
        row.average_correct_percent,
        row.total_game_time_spent_seconds,
        row.average_time_per_attempt_seconds,
      ])
    );
    downloadTextFile(
      `analytics-school-outcomes-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportLessonsCsv = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const rows = snapshot.lesson_performance || [];
    const csv = toCsv(
      [
        'School ID',
        'School Name',
        'Lesson ID',
        'Lesson Title',
        'Learners Assigned',
        'Learners Active',
        'Games Attempted',
        'Games Completed',
        'Completion Rate (%)',
        'Average Correct Responses (%)',
        'Total Attempts',
        'Time Spent (sec)',
      ],
      rows.map(row => [
        row.school_id,
        row.school_name,
        row.lesson_id,
        row.lesson_title,
        row.learners_assigned,
        row.learners_active,
        row.games_attempted,
        row.games_completed,
        row.completion_rate_percent,
        row.average_correct_responses_percent,
        row.total_attempts,
        row.total_time_spent_seconds,
      ])
    );
    downloadTextFile(
      `analytics-lesson-performance-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportStationsCsv = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const rows = snapshot.station_improvements || [];
    const csv = toCsv(
      [
        'Station Category',
        'Station',
        'Learners Measured',
        'Total Attempts',
        'Completion Rate (%)',
        'Baseline Average (%)',
        'Latest Average (%)',
        'Improvement (pts)',
      ],
      rows.map(row => [
        row.category,
        row.station_label,
        row.learners_measured,
        row.total_attempts,
        row.completion_rate,
        row.average_baseline_score,
        row.average_latest_score,
        row.average_improvement_points,
      ])
    );
    downloadTextFile(
      `analytics-station-improvements-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportSchoolsJson = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const payload = {
      exported_at: new Date().toISOString(),
      generated_at: snapshot.generated_at,
      source: snapshot.source,
      record_counts: snapshot.record_counts || null,
      school_outcomes: snapshot.school_outcomes || [],
    };
    downloadTextFile(
      `analytics-school-outcomes-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleExportLessonsJson = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const payload = {
      exported_at: new Date().toISOString(),
      generated_at: snapshot.generated_at,
      source: snapshot.source,
      record_counts: snapshot.record_counts || null,
      lesson_performance: snapshot.lesson_performance || [],
    };
    downloadTextFile(
      `analytics-lesson-performance-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleExportStationsJson = () => {
    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const payload = {
      exported_at: new Date().toISOString(),
      generated_at: snapshot.generated_at,
      source: snapshot.source,
      record_counts: snapshot.record_counts || null,
      station_improvements: snapshot.station_improvements || [],
    };
    downloadTextFile(
      `analytics-station-improvements-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const toggleAnalyticsExportSelection = (dataset: AnalyticsExportDataset) => {
    setAnalyticsExportSelections(prev => ({
      ...prev,
      [dataset]: !prev[dataset],
    }));
  };

  const runAnalyticsExport = () => {
    const selectedDatasets = (Object.keys(analyticsExportSelections) as AnalyticsExportDataset[]).filter(
      dataset => analyticsExportSelections[dataset]
    );

    if (selectedDatasets.length === 0) {
      showNoticeDialog('Select at least one analytics dataset to export.', {
        title: 'No Data Selected',
      });
      return;
    }

    const snapshot = getOperationsOverviewSnapshot();
    if (!snapshot) return;

    const exportHandlers: Record<AnalyticsExportFormat, Record<AnalyticsExportDataset, () => void>> = {
      csv: {
        school_outcomes: handleExportSchoolsCsv,
        lesson_performance: handleExportLessonsCsv,
        station_improvements: handleExportStationsCsv,
      },
      json: {
        school_outcomes: handleExportSchoolsJson,
        lesson_performance: handleExportLessonsJson,
        station_improvements: handleExportStationsJson,
      },
    };

    selectedDatasets.forEach(dataset => {
      exportHandlers[analyticsExportFormat][dataset]();
    });

    setShowAnalyticsExportModal(false);
  };

  if (loading) return <div className="loading">Loading...</div>;

  const _today = new Date().toISOString().split('T')[0];

  const operationsSchoolRows = operationsOverview?.school_outcomes || [];
  const operationsLessonRows = operationsOverview?.lesson_performance || [];
  const operationsStationRows = operationsOverview?.station_improvements || [];

  const operationsStationTotals = operationsStationRows.reduce(
    (acc, row) => {
      acc.learners_measured += row.learners_measured;
      acc.total_attempts += row.total_attempts;
      return acc;
    },
    { learners_measured: 0, total_attempts: 0 }
  );
  const selectedAnalyticsExportCount = (Object.values(analyticsExportSelections) as boolean[]).filter(Boolean).length;

  return (
    <div className="dashboard">
      <Navigation />
      <header className="dashboard-header">
        <div>
          <h1>Learning Management</h1>
          <p>
            Manage and monitor learners and the 3-station lesson model.
          </p>
        </div>
        <div className="header-actions">
          <span>{user?.name}</span>
        </div>
      </header>
      {students.length === 0 && games.length === 0 && (
        <div className="card demo-banner" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <strong>Demo mode.</strong> Use &quot;Load Sample Data&quot; below to add example schools, teachers, parents, learners, games, and lessons. Then try logging in as Teacher or Parent to see their views.
        </div>
      )}

      <div className="dashboard-layout">
        <nav className="dashboard-sidebar">
          <div className="dashboard-sidebar-label">Navigation</div>
          {[
            { id: 'lessons',       label: 'Lessons' },
            { id: 'games',         label: 'Games' },
            { id: 'schedule',      label: 'Sessions' },
            { id: 'learners',      label: 'Learners' },
            { id: 'schools',       label: 'Administration' },
            { id: 'data-export',   label: 'Analytics' },
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
        {activeSection === 'data-export' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Analytics</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Export the full operations dataset from the same platform-backed source used in Operations Overview.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setShowAnalyticsExportModal(true)}>
              Export Data
            </button>
          </div>
        </div>
        )}
        {activeSection === 'data-export' && (
        <section className="card overview-panel" aria-label="Tutor overview">
          <div className="overview-header">
            <h2>Operations Overview</h2>
            {operationsOverviewLoading ? (
              <p className="form-help" style={{ marginTop: 'var(--spacing-xs)' }}>
                Syncing live platform data...
              </p>
            ) : operationsOverview ? (
              <p className="form-help" style={{ marginTop: 'var(--spacing-xs)' }}>
                Data source: platform database · Last synced{' '}
                {new Date(operationsOverview.generated_at).toLocaleString('en-ZA')}
              </p>
            ) : (
              <p className="form-help" style={{ marginTop: 'var(--spacing-xs)', color: 'var(--color-error)' }}>
                {operationsOverviewError || 'Operations data unavailable.'}
              </p>
            )}
          </div>
          {!operationsOverview && (
          <article className="operations-overview-table-card" style={{ marginTop: 'var(--spacing-sm)' }}>
            <p className="overview-activity-empty">
              {operationsOverviewLoading
                ? 'Loading platform records for operations overview...'
                : (operationsOverviewError || 'Operations data unavailable.')}
            </p>
          </article>
          )}
          <div className="operations-overview-tables">
            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>School-Level Operations</h3>
                <p>
                  Track enrolment, attendance, parent confirmations, engagement, lesson coverage, completion rate, correct responses, attempts, and time spent.
                </p>
              </div>
              {operationsSchoolRows.length === 0 ? (
                <p className="overview-activity-empty">No school operations data yet.</p>
              ) : (
                <div className="table-scroll operations-table-scroll">
                  <table className="table operations-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>Enrolment</th>
                        <th>Sessions Scheduled</th>
                        <th>Attendance</th>
                        <th>Parent Confirmations</th>
                        <th>Teacher Engagement</th>
                        <th>Parent Engagement</th>
                        <th>Lesson Coverage</th>
                        <th>Completion Rate</th>
                        <th>Correct Responses</th>
                        <th>Attempts</th>
                        <th>Time Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operationsSchoolRows.map(row => {
                        const attendanceDenominator = row.sessions_completed + row.sessions_cancelled + row.sessions_overdue;
                        const confirmableSessions = Math.max(row.sessions_total - row.sessions_cancelled, 0);
                        return (
                          <tr key={row.school_id}>
                            <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.school_name}</td>
                            <td>
                              <span className="metric-chip metric-chip--info">{row.learner_enrolment.toLocaleString('en-US')}</span>
                            </td>
                            <td>
                              <span className="metric-chip metric-chip--neutral">
                                {(row.sessions_upcoming + row.sessions_overdue).toLocaleString('en-US')}
                              </span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.session_attendance_rate)}`}>{row.session_attendance_rate}%</span>
                              <span className="operations-cell-context">({row.sessions_completed}/{attendanceDenominator})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.parent_confirmation_rate)}`}>{row.parent_confirmation_rate}%</span>
                              <span className="operations-cell-context">({row.parent_confirmed_sessions}/{confirmableSessions})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.teacher_engagement_rate)}`}>{row.teacher_engagement_rate}%</span>
                              <span className="operations-cell-context">({row.active_teachers}/{row.teachers_total})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.parent_engagement_rate)}`}>{row.parent_engagement_rate}%</span>
                              <span className="operations-cell-context">({row.active_parents}/{row.parents_total})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.lesson_plan_coverage_rate)}`}>{row.lesson_plan_coverage_rate}%</span>
                              <span className="operations-cell-context">({row.learners_with_lesson_plan}/{row.learner_enrolment})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.game_completion_rate)}`}>{row.game_completion_rate}%</span>
                              <span className="operations-cell-context">({row.game_completions}/{row.game_attempts})</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.average_correct_percent)}`}>{row.average_correct_percent}%</span>
                            </td>
                            <td>
                              <span className="metric-chip metric-chip--neutral">{row.game_attempts.toLocaleString('en-US')}</span>
                            </td>
                            <td>
                              <span className="metric-chip metric-chip--neutral">{formatDuration(row.total_game_time_spent_seconds)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>Lesson Performance by School</h3>
                <p>
                  Compare lesson completion, correct response percentages, attempts, and time spent for each school and lesson.
                </p>
              </div>
              {operationsLessonRows.length === 0 ? (
                <p className="overview-activity-empty">No lesson performance data yet.</p>
              ) : (
                <div className="table-scroll operations-table-scroll">
                  <table className="table operations-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>Lesson</th>
                        <th>Learners Assigned</th>
                        <th>Learners Active</th>
                        <th>Completion Rate</th>
                        <th>Correct Responses</th>
                        <th>Attempts</th>
                        <th>Time Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operationsLessonRows.map(row => (
                        <tr key={`${row.school_id}:${row.lesson_id}`}>
                          <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.school_name}</td>
                          <td>{row.lesson_title}</td>
                          <td>
                            <span className="metric-chip metric-chip--info">{row.learners_assigned.toLocaleString('en-US')}</span>
                          </td>
                          <td>
                            <span className="metric-chip metric-chip--neutral">{row.learners_active.toLocaleString('en-US')}</span>
                          </td>
                          <td>
                            <span className={`metric-chip metric-chip--${getRateTone(row.completion_rate_percent)}`}>{row.completion_rate_percent}%</span>
                            <span className="operations-cell-context">({row.games_completed}/{row.games_attempted})</span>
                          </td>
                          <td>
                            <span className={`metric-chip metric-chip--${getRateTone(row.average_correct_responses_percent)}`}>{row.average_correct_responses_percent}%</span>
                          </td>
                          <td>
                            <span className="metric-chip metric-chip--neutral">{row.total_attempts.toLocaleString('en-US')}</span>
                          </td>
                          <td>
                            <span className="metric-chip metric-chip--neutral">{formatDuration(row.total_time_spent_seconds)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <article className="operations-overview-table-card">
              <div className="operations-overview-table-header">
                <h3>Station Improvements</h3>
                <p>
                  Improvement is measured as average learner score change from first attempt to latest attempt in each station.
                </p>
              </div>
              {operationsStationRows.length === 0 ? (
                <p className="overview-activity-empty">No station improvement data yet.</p>
              ) : (
                <>
                  <p className="overview-activity-empty" style={{ marginBottom: 'var(--spacing-sm)' }}>
                    {operationsStationTotals.learners_measured.toLocaleString('en-US')}
                    {' '}
                    learners measured across
                    {' '}
                    {operationsStationTotals.total_attempts.toLocaleString('en-US')}
                    {' '}
                    attempts.
                  </p>
                  <div className="table-scroll operations-table-scroll">
                    <table className="table operations-table">
                      <thead>
                        <tr>
                          <th>Station</th>
                          <th>Learners Measured</th>
                          <th>Total Attempts</th>
                          <th>Completion Rate</th>
                          <th>Baseline Avg</th>
                          <th>Latest Avg</th>
                          <th>Improvement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operationsStationRows.map(row => (
                          <tr key={row.category}>
                            <td>
                              <span className={`metric-chip metric-chip--station-${row.category}`}>
                                {row.station_label}
                              </span>
                            </td>
                            <td>
                              <span className="metric-chip metric-chip--neutral">{row.learners_measured.toLocaleString('en-US')}</span>
                            </td>
                            <td>
                              <span className="metric-chip metric-chip--neutral">{row.total_attempts.toLocaleString('en-US')}</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.completion_rate)}`}>{row.completion_rate}%</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.average_baseline_score)}`}>{row.average_baseline_score}%</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getRateTone(row.average_latest_score)}`}>{row.average_latest_score}%</span>
                            </td>
                            <td>
                              <span className={`metric-chip metric-chip--${getImprovementTone(row.average_improvement_points)}`}>
                                {row.average_improvement_points > 0 ? '+' : ''}
                                {row.average_improvement_points}
                                {' '}
                                pts
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </article>
          </div>
          {students.length === 0 && games.length === 0 && (
            <div className="overview-seed card" style={{ marginTop: 'var(--spacing-md)', textAlign: 'center' }}>
              <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>Welcome to Your LMS</h3>
              <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                Load sample data to preview schools, staff, learners, lessons, and progress.
              </p>
              <button onClick={handleSeedDatabase} className="btn btn-primary" disabled={seeding}>
                {seeding ? 'Seeding...' : 'Load Sample Data'}
              </button>
            </div>
          )}
        </section>
        )}
        <OnboardingModal
          isOpen={showOnboardingTip}
          role="tutor"
          onComplete={dismissOnboardingTip}
        />

        {activeSection === 'schools' && (<>
        <div className="dashboard-section">
          <div className="section-header administration-header">
            <div className="administration-header-content">
              <h2>Administration</h2>
              <p className="administration-subtitle">
                Manage schools, teachers, parents, and learner links.
              </p>
            </div>
            <div className="section-primary-actions">
              <button onClick={() => setShowSchoolModal(true)} className="btn btn-primary">
                Add School
              </button>
            </div>
          </div>
          {schools.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <p>No schools added yet. Add your first school to get started.</p>
                <div className="empty-state-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowSchoolModal(true)}>
                    Add School
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="administration-schools-grid">
              {schools.map(school => {
                const schoolTeachers = teachers.filter(t => t.school_id === school.id);
                const schoolStudents = students.filter(s => s.school_id === school.id);
                const schoolParents  = parents.filter(p => p.school_id === school.id);
                const hasSchoolMeta = Boolean(school.address || school.contact_email || school.contact_phone);
                return (
                  <article key={school.id} className="card school-admin-card">
                    <div className="school-admin-card-header">
                      <h3 className="school-admin-card-title">{school.name}</h3>
                    </div>
                    <dl className="school-admin-card-meta">
                      {school.address && (
                        <div className="school-admin-meta-row">
                          <dt>Address</dt>
                          <dd>{school.address}</dd>
                        </div>
                      )}
                      {school.contact_email && (
                        <div className="school-admin-meta-row">
                          <dt>Email</dt>
                          <dd>{school.contact_email}</dd>
                        </div>
                      )}
                      {school.contact_phone && (
                        <div className="school-admin-meta-row">
                          <dt>Phone</dt>
                          <dd>{school.contact_phone}</dd>
                        </div>
                      )}
                      {!hasSchoolMeta && (
                        <div className="school-admin-meta-empty">No contact details added yet.</div>
                      )}
                    </dl>
                    <div className="school-admin-card-metrics">
                      <article className="school-admin-card-metric">
                        <span className="metric-chip metric-chip--info school-count-chip">{schoolTeachers.length}</span>
                        <p>Teachers</p>
                      </article>
                      <article className="school-admin-card-metric">
                        <span className="metric-chip metric-chip--good school-count-chip">{schoolStudents.length}</span>
                        <p>Learners</p>
                      </article>
                      <article className="school-admin-card-metric">
                        <span className="metric-chip metric-chip--warn school-count-chip">{schoolParents.length}</span>
                        <p>Parents</p>
                      </article>
                    </div>
                    <div className="school-admin-card-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { setSchoolDetailId(school.id); setSchoolDetailTab('teachers'); setShowSchoolDetailModal(true); }}
                      >
                        View Details
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => handleDeleteSchool(school)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        </>)}
        {activeSection === 'learners' && (<>
        <div className="dashboard-section">
          <div className="section-header learner-roster-header">
            <div className="learner-roster-header-content">
              <h2>Learner Roster</h2>
              <p className="learner-roster-subtitle">
                Manage learners enrolled in your digital literacy program
              </p>
              <div className="section-primary-actions learner-roster-actions">
                <select
                  className="input"
                  value={rosterSchoolId}
                  onChange={e => setRosterSchoolId(e.target.value)}
                  aria-label="Select school roster"
                >
                  {schoolScopeOptions.length === 0 ? (
                    <option value="">No schools available</option>
                  ) : (
                    schoolScopeOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))
                  )}
                </select>
                <input
                  type="search"
                  className="input"
                  placeholder="Search learner by name, email, or grade"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  aria-label="Search learners"
                />
              </div>
            </div>
            <div className="section-primary-actions">
              <button
                onClick={() => openStudentModal(rosterSchoolId === UNASSIGNED_SCHOOL_SCOPE_ID ? '' : rosterSchoolId)}
                className="btn btn-primary"
              >
                Add Learner
              </button>
            </div>
          </div>
          <div className="card">
            {rosterStudents.length === 0 ? (
              <div className="empty-state">
                <p>
                  {students.length === 0
                    ? 'No learners yet. Add your first learner to get started.'
                    : !rosterSchoolId
                      ? 'Select a school to view learner roster.'
                      : studentSearch.trim()
                        ? 'No learners in this school match your search. Try a different keyword.'
                        : 'No learners linked to this school yet.'}
                </p>
                <div className="empty-state-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openStudentModal(rosterSchoolId === UNASSIGNED_SCHOOL_SCOPE_ID ? '' : rosterSchoolId)}
                  >
                    Add Learner
                  </button>
                  {students.length > 0 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStudentSearch('')}>
                      Clear Search
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Learner Name</th>
                    <th>School</th>
                    <th>Grade Level</th>
                    <th>Age</th>
                    <th>Assigned Lessons</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterStudents.map(student => (
                    <tr key={student.id}>
                      <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{student.name}</td>
                      <td>{getSchoolLabelForScope(student.school_id || UNASSIGNED_SCHOOL_SCOPE_ID)}</td>
                      <td>Grade {student.grade}</td>
                      <td>{student.age} years</td>
                      <td>
                        {(() => {
                          const assignments = getSortedAssignmentsForStudent(student.id);
                          const assignedLessonIds = new Set(assignments.map(assignment => assignment.lesson_id));
                          return (
                            <div className="lesson-assignment-cell">
                              <div className="lesson-assignment-list">
                                {assignments.length === 0 ? (
                                  <span className="lesson-assignment-empty">No lessons assigned yet.</span>
                                ) : (
                                  assignments.map(assignment => (
                                    <span key={assignment.id} className="lesson-assignment-chip">
                                      <span className="lesson-assignment-chip-title">{assignment.lesson_title}</span>
                                      <button
                                        type="button"
                                        className="lesson-assignment-remove"
                                        aria-label={`Unassign ${assignment.lesson_title} from ${student.name}`}
                                        onClick={() => handleRemoveLessonSelection(student.id, assignment)}
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  ))
                                )}
                              </div>
                              <div className="lesson-assignment-controls">
                                <select
                                  className="input lesson-assignment-select"
                                  defaultValue=""
                                  onChange={e => {
                                    const nextLessonId = e.target.value;
                                    if (!nextLessonId) return;
                                    void handleAddLessonSelection(student.id, nextLessonId);
                                    e.target.value = '';
                                  }}
                                  aria-label={`Add lesson for ${student.name}`}
                                  disabled={lessonAssignmentSavingId === student.id || lessons.length === 0}
                                >
                                  <option value="">Add lesson...</option>
                                  {lessons.map(lesson => (
                                    <option
                                      key={lesson.id}
                                      value={lesson.id}
                                      disabled={assignedLessonIds.has(lesson.id)}
                                    >
                                      {lesson.title}{assignedLessonIds.has(lesson.id) ? ' (assigned)' : ''}
                                    </option>
                                  ))}
                                </select>
                                {lessonAssignmentSavingId === student.id && (
                                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Saving...</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {lessonAssignmentErrors[student.id] && (
                          <p className="form-error" role="status">{lessonAssignmentErrors[student.id]}</p>
                        )}
                        {!lessonAssignmentErrors[student.id] && (
                          <p className="form-help">Add multiple lessons as needed and remove with &times;.</p>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditStudentModal(student)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openProfileModal(student.id)}
                          >
                            Profile
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openNotesModal(student.id)}
                          >
                            Notes
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDeleteStudent(student)}
                          >
                            Remove
                          </button>
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
        </>)}
        {activeSection === 'games' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Game Library</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Curate educational games across computational thinking, typing, and purposeful gaming
              </p>
            </div>
            <button onClick={() => openGameModal()} className="btn btn-primary">
              Add Game
            </button>
          </div>
          <div className="card">
            {games.length === 0 ? (
              <div className="empty-state">
                <p>No games in your library yet. Add educational games to engage your learners.</p>
                <div className="empty-state-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openGameModal()}>
                    Add Game
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Thumbnail</th>
                    <th>Game Title</th>
                    <th>Category</th>
                    <th>Difficulty</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map(game => (
                    <tr key={game.id}>
                      <td>
                        {game.thumbnail_url ? (
                          <img
                            src={game.thumbnail_url}
                            alt={`${game.title} thumbnail`}
                            style={{
                              width: '72px',
                              height: '40px',
                              objectFit: 'cover',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--color-border)',
                            }}
                          />
                        ) : (
                          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>None</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{game.title}</td>
                      <td>
                        <span className={`badge badge-${game.category.replace('_', '-')}`}>
                          {game.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          Level {game.difficulty_level}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openGameModal(game)}>
                            Manage
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDeleteGame(game.id)}
                          >
                            Remove
                          </button>
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
        {activeSection === 'lessons' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Lesson Plans</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Create structured lessons using the 3-station model: Computational Thinking, Typing, and Purposeful Gaming
              </p>
            </div>
            <button onClick={() => openLessonModal()} className="btn btn-primary">
              Create Lesson
            </button>
          </div>
          <div className="card">
            {lessons.length === 0 ? (
              <div className="empty-state">
                <p>No lessons created yet. Build your first 3-station lesson plan.</p>
                <div className="empty-state-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openLessonModal()}>
                    Create Lesson
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lesson Title</th>
                    <th>Station 1: Computational</th>
                    <th>Station 2: Typing</th>
                    <th>Station 3: Gaming</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map(lesson => (
                    <tr key={lesson.id}>
                      <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{lesson.title}</td>
                      <td>
                        {resolveLinkedGameTitle(lesson.station_1_game_id, lesson.station_1_title) ? (
                          <span className="badge badge-computational">
                            {resolveLinkedGameTitle(lesson.station_1_game_id, lesson.station_1_title)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {resolveLinkedGameTitle(lesson.station_2_game_id, lesson.station_2_title) ? (
                          <span className="badge badge-typing">
                            {resolveLinkedGameTitle(lesson.station_2_game_id, lesson.station_2_title)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {resolveLinkedGameTitle(lesson.station_3_game_id, lesson.station_3_title) ? (
                          <span className="badge badge-gaming">
                            {resolveLinkedGameTitle(lesson.station_3_game_id, lesson.station_3_title)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openLessonDetailModal(lesson.id)}>
                            Details
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openLessonModal(lesson)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDeleteLesson(lesson.id)}
                          >
                            Remove
                          </button>
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
        {activeSection === 'schedule' && (
        <div className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Session Schedule</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}>
                Manage upcoming and past sessions. Visible to teachers and parents.
              </p>
            </div>
            <div className="section-primary-actions">
              <select
                className="input"
                value={schedSchoolFilterId}
                onChange={e => setSchedSchoolFilterId(e.target.value)}
                style={{ fontSize: 'var(--font-size-sm)', width: 'auto' }}
                aria-label="Filter sessions by school"
              >
                <option value={ALL_SCHOOL_SCOPE_ID}>All schools</option>
                {schoolScopeOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <select className="input" value={schedFilter} onChange={e => setSchedFilter(e.target.value)} style={{ fontSize: 'var(--font-size-sm)', width: 'auto' }}>
                <option value="upcoming">Upcoming</option>
                <option value="all">All sessions</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="schedule-view-toggle" role="tablist" aria-label="Session schedule view mode">
                <button
                  type="button"
                  className={schedViewMode === 'list' ? 'active' : ''}
                  onClick={() => setSchedViewMode('list')}
                >
                  List
                </button>
                <button
                  type="button"
                  className={schedViewMode === 'calendar' ? 'active' : ''}
                  onClick={() => setSchedViewMode('calendar')}
                >
                  Calendar
                </button>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => openSchedModal(undefined, schedSchoolFilterId === ALL_SCHOOL_SCOPE_ID ? undefined : schedSchoolFilterId)}
              >
                Add Session
              </button>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0 }}>Calendar Integrations</h3>
                <p className="form-help" style={{ marginTop: 'var(--spacing-xs)' }}>
                  Link your tutor account to Google or Microsoft so session create, update, and delete actions sync to your external calendar automatically.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchCalendarIntegrations}
                disabled={calendarIntegrationsLoading}
              >
                {calendarIntegrationsLoading ? 'Refreshing...' : 'Refresh Status'}
              </button>
            </div>
            {calendarNotice && (
              <p
                style={{
                  marginTop: 'var(--spacing-xs)',
                  marginBottom: 0,
                  fontSize: 'var(--font-size-sm)',
                  color: calendarNotice.kind === 'error' ? 'var(--color-error)' : 'var(--color-success)',
                }}
              >
                {calendarNotice.text}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
              {calendarProviderOptions.map((provider) => {
                const integration = getCalendarIntegrationStatus(provider);
                const busy = calendarActionProvider === provider;
                return (
                  <div key={provider} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', background: 'var(--color-surface)' }}>
                    <h4 style={{ margin: '0 0 var(--spacing-xs)' }}>{CALENDAR_PROVIDER_LABELS[provider]}</h4>
                    {!integration.configured ? (
                      <p className="form-help" style={{ marginTop: 0 }}>
                        Not configured on this server. Add {provider === 'google' ? '`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`' : '`MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`'}.
                      </p>
                    ) : integration.linked ? (
                      <>
                        <p style={{ margin: '0 0 var(--spacing-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--color-success)' }}>
                          Connected
                        </p>
                        <p className="form-help" style={{ marginTop: 0, marginBottom: 'var(--spacing-xs)' }}>
                          Account: {integration.external_email || 'Calendar account linked'}
                        </p>
                        {integration.updated_at && (
                          <p className="form-help" style={{ marginTop: 0 }}>
                            Linked: {new Date(integration.updated_at).toLocaleString('en-ZA')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="form-help" style={{ marginTop: 0 }}>
                        Not linked yet.
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                      {!integration.linked ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleConnectCalendar(provider)}
                          disabled={!integration.configured || busy}
                        >
                          {busy ? 'Connecting...' : 'Link Calendar'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => handleDisconnectCalendar(provider)}
                          disabled={busy}
                        >
                          {busy ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {schedLoading ? (
              <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-tertiary)' }}>Loading...</div>
            ) : (() => {
              const today = new Date().toISOString().split('T')[0];
              const preferredSchoolScopeId = schedSchoolFilterId === ALL_SCHOOL_SCOPE_ID ? undefined : schedSchoolFilterId;
              const filtered = sortSessions(
                schedule.filter(s => {
                  const schoolScopeId = getSchoolScopeForStudent(s.student_id);
                  if (schedSchoolFilterId !== ALL_SCHOOL_SCOPE_ID && schoolScopeId !== schedSchoolFilterId) return false;
                  if (schedFilter === 'upcoming')  return s.status === 'scheduled' && s.session_date >= today;
                  if (schedFilter === 'completed') return s.status === 'completed';
                  if (schedFilter === 'cancelled') return s.status === 'cancelled';
                  return true;
                })
              );
              return filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
                  <p>No {schedFilter === 'all' ? '' : schedFilter} sessions yet. Use "Add Session" to schedule one.</p>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openSchedModal(undefined, preferredSchoolScopeId)}
                    >
                      Add Session
                    </button>
                  </div>
                </div>
              ) : schedViewMode === 'list' ? (
                <div className="table-scroll">
                <table className="table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>School</th>
                      <th>Grade</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Lesson</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{s.student_name}</td>
                        <td>{getSchoolLabelForScope(getSchoolScopeForStudent(s.student_id) || UNASSIGNED_SCHOOL_SCOPE_ID)}</td>
                        <td>Grade {s.student_grade}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                          {new Date(s.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                          {s.start_time}{s.end_time ? ` - ${s.end_time}` : ''}
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                          {s.lesson_title || s.title || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                        </td>
                        <td>
                          <span className={`session-status-pill ${s.status}`}>
                            {getSessionStatusLabel(s.status)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openSchedModal(s)}>Edit</button>
                            {s.status === 'scheduled' && (
                              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-success)' }} onClick={() => openDoneModal(s.id, s.session_date)}>Complete + Note</button>
                            )}
                            {s.status === 'scheduled' && (
                              <button className="btn btn-secondary btn-sm" onClick={() => handleCancelSession(s.id)}>
                                Cancel
                              </button>
                            )}
                            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteSession(s.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                (() => {
                  const [yearRaw, monthRaw] = schedCalendarMonth.split('-').map(Number);
                  const safeYear = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
                  const safeMonth = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
                  const monthStart = new Date(safeYear, safeMonth - 1, 1);
                  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();
                  const firstDayOffset = (monthStart.getDay() + 6) % 7;
                  const sessionsByDate = filtered.reduce<Record<string, SessionEntry[]>>((acc, session) => {
                    acc[session.session_date] = acc[session.session_date] || [];
                    acc[session.session_date].push(session);
                    return acc;
                  }, {});
                  const selectedDate =
                    schedCalendarDate && schedCalendarDate.startsWith(`${schedCalendarMonth}-`)
                      ? schedCalendarDate
                      : '';
                  const selectedDateSessions = selectedDate
                    ? sortSessions(sessionsByDate[selectedDate] || [])
                    : [];
                  const monthLabel = monthStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
                  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

                  const shiftMonth = (delta: number) => {
                    const nextMonthDate = new Date(safeYear, safeMonth - 1 + delta, 1);
                    const nextMonthValue = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
                    setSchedCalendarMonth(nextMonthValue);
                    setSchedCalendarDate('');
                  };

                  return (
                    <div className="schedule-calendar-shell">
                      <div className="schedule-calendar-toolbar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shiftMonth(-1)}>
                            Previous
                          </button>
                          <strong>{monthLabel}</strong>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shiftMonth(1)}>
                            Next
                          </button>
                        </div>
                        <input
                          type="month"
                          className="input"
                          style={{ width: 'auto' }}
                          value={schedCalendarMonth}
                          onChange={e => {
                            setSchedCalendarMonth(e.target.value);
                            setSchedCalendarDate('');
                          }}
                          aria-label="Choose calendar month"
                        />
                      </div>
                      <div className="schedule-calendar-scroll">
                        <div className="schedule-calendar-grid">
                          {weekdays.map(day => (
                            <div key={day} className="schedule-calendar-weekday">{day}</div>
                          ))}
                          {Array.from({ length: firstDayOffset }).map((_, index) => (
                            <div key={`empty-${index}`} className="schedule-calendar-cell is-empty" aria-hidden="true" />
                          ))}
                          {Array.from({ length: daysInMonth }).map((_, index) => {
                            const day = index + 1;
                            const dateKey = `${schedCalendarMonth}-${String(day).padStart(2, '0')}`;
                            const daySessions = sortSessions(sessionsByDate[dateKey] || []);
                            const scheduledCount = daySessions.filter(session => session.status === 'scheduled').length;
                            const completedCount = daySessions.filter(session => session.status === 'completed').length;
                            const cancelledCount = daySessions.filter(session => session.status === 'cancelled').length;
                            const isSelected = schedCalendarDate === dateKey;
                            return (
                              <button
                                key={dateKey}
                                type="button"
                                className={`schedule-calendar-cell${daySessions.length > 0 ? ' has-sessions' : ''}${isSelected ? ' is-selected' : ''}`}
                                onClick={() => setSchedCalendarDate(dateKey)}
                              >
                                <span className="schedule-calendar-day-number">{day}</span>
                                <span className={`schedule-calendar-day-count${daySessions.length === 0 ? ' is-empty' : ''}`}>
                                  {daySessions.length > 0
                                    ? `${daySessions.length} session${daySessions.length === 1 ? '' : 's'}`
                                    : 'No sessions'}
                                </span>
                                <div className="schedule-calendar-status-row">
                                  {scheduledCount > 0 && <span className="schedule-status-pill scheduled">{scheduledCount} scheduled</span>}
                                  {completedCount > 0 && <span className="schedule-status-pill completed">{completedCount} completed</span>}
                                  {cancelledCount > 0 && <span className="schedule-status-pill cancelled">{cancelledCount} cancelled</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="schedule-calendar-detail">
                        <h3>
                          {selectedDate
                            ? `Sessions for ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'Select a day to view sessions'}
                        </h3>
                        {!selectedDate ? (
                          <p className="form-help">Pick a date from the calendar to view session details.</p>
                        ) : selectedDateSessions.length === 0 ? (
                          <p className="form-help">No sessions scheduled on this date.</p>
                        ) : (
                          <div className="table-scroll">
                            <table className="table" style={{ marginBottom: 0 }}>
                              <thead>
                                <tr>
                                  <th>Learner</th>
                                  <th>School</th>
                                  <th>Grade</th>
                                  <th>Time</th>
                                  <th>Lesson</th>
                                  <th>Status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedDateSessions.map(session => (
                                  <tr key={session.id}>
                                    <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{session.student_name}</td>
                                    <td>{getSchoolLabelForScope(getSchoolScopeForStudent(session.student_id) || UNASSIGNED_SCHOOL_SCOPE_ID)}</td>
                                    <td>Grade {session.student_grade}</td>
                                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                                      {session.start_time}{session.end_time ? ` - ${session.end_time}` : ''}
                                    </td>
                                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                      {session.lesson_title || session.title || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                                    </td>
                                    <td>
                                      <span className={`session-status-pill ${session.status}`}>
                                        {getSessionStatusLabel(session.status)}
                                      </span>
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => openSchedModal(session)}>Edit</button>
                                        {session.status === 'scheduled' && (
                                          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-success)' }} onClick={() => openDoneModal(session.id, session.session_date)}>Complete + Note</button>
                                        )}
                                        {session.status === 'scheduled' && (
                                          <button className="btn btn-secondary btn-sm" onClick={() => handleCancelSession(session.id)}>
                                            Cancel
                                          </button>
                                        )}
                                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteSession(session.id)}>Delete</button>
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
                  );
                })()
              );
            })()}
          </div>
        </div>
        )}
        </div>
      </div>

      {showStudentModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingStudentId ? 'Edit Learner' : 'Add Learner'}</h2>
              <button
                type="button"
                className="close"
                aria-label={editingStudentId ? 'Close edit learner dialog' : 'Close add learner dialog'}
                onClick={closeStudentModal}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddStudent} noValidate>
              <p className="form-help" style={{ marginTop: 0 }}>
                Step {studentWizardStep} of 3:
                {' '}
                {studentWizardStep === 1 ? 'Basics' : studentWizardStep === 2 ? 'Details' : 'Review'}
              </p>
              <p className="form-help">Draft saves automatically on this device while you work.</p>
              {studentWizardStep === 1 && (
                <>
                  <div className="form-group">
                    <label htmlFor="student-name-input">Learner Name *</label>
                    <input
                      id="student-name-input"
                      type="text"
                      className={`input${shouldShowStudentError('name') && studentFormErrors.name ? ' input-invalid' : ''}`}
                      value={studentForm.name}
                      onChange={e => updateStudentFormField('name', e.target.value)}
                      onBlur={() => setStudentFormTouched(prev => ({ ...prev, name: true }))}
                      placeholder="Enter full name"
                      aria-invalid={shouldShowStudentError('name') && !!studentFormErrors.name}
                      aria-describedby="student-name-help"
                    />
                    {shouldShowStudentError('name') && studentFormErrors.name ? (
                      <p id="student-name-help" className="form-error" role="status">{studentFormErrors.name}</p>
                    ) : (
                      <p id="student-name-help" className="form-help">Use the full name used for attendance records.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-email-input">Email Address</label>
                    <input
                      id="student-email-input"
                      type="email"
                      className={`input${shouldShowStudentError('email') && studentFormErrors.email ? ' input-invalid' : ''}`}
                      value={studentForm.email}
                      onChange={e => updateStudentFormField('email', e.target.value)}
                      onBlur={() => setStudentFormTouched(prev => ({ ...prev, email: true }))}
                      placeholder="learner@example.com"
                      aria-invalid={shouldShowStudentError('email') && !!studentFormErrors.email}
                      aria-describedby="student-email-help"
                    />
                    {shouldShowStudentError('email') && studentFormErrors.email ? (
                      <p id="student-email-help" className="form-error" role="status">{studentFormErrors.email}</p>
                    ) : (
                      <p id="student-email-help" className="form-help">Optional. Add this only if the learner has an email address.</p>
                    )}
                  </div>
                </>
              )}
              {studentWizardStep === 2 && (
                <>
                  <div className="form-group">
                    <label htmlFor="student-grade-input">Grade Level (4-9) *</label>
                    <input
                      id="student-grade-input"
                      type="number"
                      className={`input${shouldShowStudentError('grade') && studentFormErrors.grade ? ' input-invalid' : ''}`}
                      min="4"
                      max="9"
                      value={studentForm.grade}
                      onChange={e => updateStudentFormField('grade', e.target.value)}
                      onBlur={() => setStudentFormTouched(prev => ({ ...prev, grade: true }))}
                      placeholder="Select grade"
                      aria-invalid={shouldShowStudentError('grade') && !!studentFormErrors.grade}
                      aria-describedby="student-grade-help"
                    />
                    {shouldShowStudentError('grade') && studentFormErrors.grade ? (
                      <p id="student-grade-help" className="form-error" role="status">{studentFormErrors.grade}</p>
                    ) : (
                      <p id="student-grade-help" className="form-help">Accepted range is Grade 4 to Grade 9.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-age-input">Age (9-16) *</label>
                    <input
                      id="student-age-input"
                      type="number"
                      className={`input${shouldShowStudentError('age') && studentFormErrors.age ? ' input-invalid' : ''}`}
                      min="9"
                      max="16"
                      value={studentForm.age}
                      onChange={e => updateStudentFormField('age', e.target.value)}
                      onBlur={() => setStudentFormTouched(prev => ({ ...prev, age: true }))}
                      placeholder="Enter age"
                      aria-invalid={shouldShowStudentError('age') && !!studentFormErrors.age}
                      aria-describedby="student-age-help"
                    />
                    {shouldShowStudentError('age') && studentFormErrors.age ? (
                      <p id="student-age-help" className="form-error" role="status">{studentFormErrors.age}</p>
                    ) : (
                      <p id="student-age-help" className="form-help">Age helps align game difficulty and pacing.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-learner-pin-input">
                      Learner PIN (4-8 digits){editingStudentId ? ' (Optional)' : ' *'}
                    </label>
                    <input
                      id="student-learner-pin-input"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className={`input${shouldShowStudentError('learner_pin') && studentFormErrors.learner_pin ? ' input-invalid' : ''}`}
                      value={studentForm.learner_pin}
                      onChange={e => updateStudentFormField('learner_pin', e.target.value)}
                      onBlur={() => setStudentFormTouched(prev => ({ ...prev, learner_pin: true }))}
                      placeholder="Enter 4-8 digit PIN"
                      aria-invalid={shouldShowStudentError('learner_pin') && !!studentFormErrors.learner_pin}
                      aria-describedby="student-learner-pin-help"
                    />
                    {shouldShowStudentError('learner_pin') && studentFormErrors.learner_pin ? (
                      <p id="student-learner-pin-help" className="form-error" role="status">{studentFormErrors.learner_pin}</p>
                    ) : (
                      <p id="student-learner-pin-help" className="form-help">
                        {editingStudentId
                          ? 'Leave blank to keep the current PIN, or enter a new PIN to reset it.'
                          : 'Learners use this PIN to sign in. You can reset it anytime by editing the learner.'}
                      </p>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-parent-input">Link to Parent (Optional)</label>
                    <select
                      id="student-parent-input"
                      className="input"
                      value={studentForm.parent_id}
                      onChange={e => updateStudentFormField('parent_id', e.target.value)}
                    >
                      <option value="">No parent assigned</option>
                      {parents.map(parent => (
                        <option key={parent.id} value={parent.id}>{parent.name} ({parent.email})</option>
                      ))}
                    </select>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                      Link this learner to a parent account so they can view their progress
                    </p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-teacher-input">Link to Teacher (Optional)</label>
                    <select
                      id="student-teacher-input"
                      className="input"
                      value={studentForm.teacher_id}
                      onChange={e => updateStudentFormField('teacher_id', e.target.value)}
                    >
                      <option value="">No teacher assigned</option>
                      {teachers
                        .filter(teacher => !studentForm.school_id || teacher.school_id === studentForm.school_id)
                        .map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name} ({teacher.email})
                          </option>
                        ))}
                    </select>
                    <p className="form-help">Link this learner to the teacher responsible for sessions and follow-up.</p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-school-input">School (Optional)</label>
                    <select
                      id="student-school-input"
                      className="input"
                      value={studentForm.school_id}
                      onChange={e => updateStudentFormField('school_id', e.target.value)}
                    >
                      <option value="">Select a school...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <p className="form-help">Assigning a school keeps staff and family lists organized.</p>
                  </div>
                </>
              )}
              {studentWizardStep === 3 && (
                <div className="card" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
                  <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>
                    Review Learner Details
                  </h3>
                  <p className="form-help" style={{ marginTop: 0 }}>Confirm these details before creating the learner profile.</p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}><strong>Name:</strong> {studentForm.name || '—'}</p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}><strong>Email:</strong> {studentForm.email || '—'}</p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}><strong>Grade:</strong> {studentForm.grade || '—'}</p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}><strong>Age:</strong> {studentForm.age || '—'}</p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                    <strong>Learner PIN:</strong> {studentForm.learner_pin ? `${studentForm.learner_pin.length} digits provided` : '—'}
                  </p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                    <strong>Parent:</strong> {parents.find(parent => parent.id === studentForm.parent_id)?.name || 'Not linked'}
                  </p>
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                    <strong>Teacher:</strong> {teachers.find(teacher => teacher.id === studentForm.teacher_id)?.name || 'Not linked'}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>School:</strong> {schools.find(school => school.id === studentForm.school_id)?.name || 'Not assigned'}
                  </p>
                </div>
              )}
              <div className="modal-actions">
                {studentWizardStep > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStudentWizardStep(prev => Math.max(1, prev - 1))}
                  >
                    Back
                  </button>
                )}
                {studentWizardStep < 3 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setStudentSubmitAttempted(true);
                      if (studentWizardStep === 1 && !canContinueStudentWizardStep1) return;
                      if (studentWizardStep === 2 && !canContinueStudentWizardStep2) return;
                      setStudentWizardStep(prev => Math.min(3, prev + 1));
                    }}
                  >
                    Next
                  </button>
                )}
                {studentWizardStep === 3 && (
                <button type="submit" className="btn btn-primary" disabled={studentSubmitting || !isStudentFormValid}>
                  {studentSubmitting
                    ? editingStudentId
                      ? 'Saving Learner...'
                      : 'Adding Learner...'
                    : editingStudentId
                      ? 'Save Learner'
                      : 'Add Learner'}
                </button>
                )}
                <button type="button" onClick={closeStudentModal} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGameModal && (
        <div className="modal">
          <div className="modal-content learner-profile-modal-content">
            <div className="modal-header">
              <h2>{editingGameId ? 'Manage Game' : 'Add Game'}</h2>
              <button type="button" className="close" aria-label="Close add game dialog" onClick={closeGameModal}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveGame}>
              <div className="form-group">
                <label>Game Title *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="Enter game title"
                  value={gameForm.title}
                  onChange={e => setGameForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="input"
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  placeholder="Describe the learning objectives and gameplay"
                  value={gameForm.description}
                  onChange={e => setGameForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  className="input"
                  required
                  value={gameForm.category}
                  onChange={e => setGameForm(prev => ({ ...prev, category: e.target.value }))}
                >
                  <option value="">Select a category</option>
                  <option value="computational_thinking">Computational Thinking</option>
                  <option value="typing">Typing</option>
                  <option value="purposeful_gaming">Purposeful Gaming</option>
                </select>
              </div>
              <div className="form-group">
                <label>Difficulty Level (1-5)</label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="5"
                  value={gameForm.difficulty_level}
                  onChange={e => setGameForm(prev => ({ ...prev, difficulty_level: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Game URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/game"
                  value={gameForm.game_url}
                  onChange={e => setGameForm(prev => ({ ...prev, game_url: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Thumbnail Image {!editingGameId ? '*' : ''}</label>
                <input
                  type="file"
                  className="input"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  required={!editingGameId && !gameForm.thumbnail_url}
                  onChange={handleGameThumbnailChange}
                />
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                  Upload PNG, JPG, WEBP, or GIF (max 350 KB).
                </p>
                {gameForm.thumbnail_url && (
                  <img
                    src={gameForm.thumbnail_url}
                    alt="Game thumbnail preview"
                    style={{
                      marginTop: 'var(--spacing-sm)',
                      width: '100%',
                      maxWidth: '220px',
                      maxHeight: '132px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                )}
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={gameForm.tracking_enabled}
                    onChange={e => setGameForm(prev => ({ ...prev, tracking_enabled: e.target.checked }))}
                    style={{ marginRight: 'var(--spacing-xs)' }}
                  />
                  Enable Progress Tracking
                </label>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                  When enabled, learner progress (scores, completion, time spent) will be tracked for this game.
                </p>
              </div>
              <div className="form-group">
                <label>Instructions</label>
                <textarea
                  className="input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="How to play the game"
                  value={gameForm.instructions}
                  onChange={e => setGameForm(prev => ({ ...prev, instructions: e.target.value }))}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {editingGameId ? 'Save Changes' : 'Add Game'}
                </button>
                <button type="button" onClick={closeGameModal} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLessonModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingLessonId ? 'Edit Lesson' : 'Create Lesson (3-Station Model)'}</h2>
              <button type="button" className="close" aria-label="Close create lesson dialog" onClick={closeLessonModal}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveLesson}>
              <div className="form-group">
                <label>Lesson Title *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="Enter lesson title"
                  value={lessonForm.title}
                  onChange={e => setLessonForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Describe the learning objectives"
                  value={lessonForm.description}
                  onChange={e => setLessonForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Lesson Content (WYSIWYG)</label>
                <WysiwygEditor
                  value={lessonForm.lesson_content.richContentHtml}
                  onChange={(html) => updateLessonContentField('richContentHtml', html)}
                  placeholder="Create a clean lesson page with headings, short paragraphs, lists, links, and online images."
                  minHeight={320}
                />
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                  Use the Image button to insert online image URLs and the Link button for sources.
                </p>
              </div>
              <div className="form-group">
                <label>Thumbnail Image {!editingLessonId ? '*' : ''}</label>
                <input
                  type="file"
                  className="input"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  required={!editingLessonId && !lessonForm.thumbnail_url}
                  onChange={handleLessonThumbnailChange}
                />
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
                  Upload PNG, JPG, WEBP, or GIF (max 3 MB).
                </p>
                {lessonForm.thumbnail_url && (
                  <img
                    src={lessonForm.thumbnail_url}
                    alt="Lesson thumbnail preview"
                    style={{
                      marginTop: 'var(--spacing-sm)',
                      width: '100%',
                      maxWidth: '220px',
                      maxHeight: '132px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                )}
              </div>
              <div className="form-group">
                <label>Station 1: Computational Thinking</label>
                <select
                  className="input"
                  value={lessonForm.station_1_game_id}
                  onChange={e => setLessonForm(prev => ({ ...prev, station_1_game_id: e.target.value }))}
                >
                  <option value="">Select a computational thinking game...</option>
                  {games.filter(g => g.category === 'computational_thinking').map(game => (
                    <option key={game.id} value={game.id}>{game.title}</option>
                  ))}
                </select>
                <textarea
                  className="input"
                  style={{ minHeight: '72px', resize: 'vertical', marginTop: 'var(--spacing-sm)' }}
                  placeholder="Guidance for station 1"
                  value={lessonForm.lesson_content.stationGuidance[0] || ''}
                  onChange={e => updateLessonContentListItem('stationGuidance', 0, e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Station 2: Typing</label>
                <select
                  className="input"
                  value={lessonForm.station_2_game_id}
                  onChange={e => setLessonForm(prev => ({ ...prev, station_2_game_id: e.target.value }))}
                >
                  <option value="">Select a typing game...</option>
                  {games.filter(g => g.category === 'typing').map(game => (
                    <option key={game.id} value={game.id}>{game.title}</option>
                  ))}
                </select>
                <textarea
                  className="input"
                  style={{ minHeight: '72px', resize: 'vertical', marginTop: 'var(--spacing-sm)' }}
                  placeholder="Guidance for station 2"
                  value={lessonForm.lesson_content.stationGuidance[1] || ''}
                  onChange={e => updateLessonContentListItem('stationGuidance', 1, e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Station 3: Purposeful Gaming</label>
                <select
                  className="input"
                  value={lessonForm.station_3_game_id}
                  onChange={e => setLessonForm(prev => ({ ...prev, station_3_game_id: e.target.value }))}
                >
                  <option value="">Select a purposeful gaming activity...</option>
                  {games.filter(g => g.category === 'purposeful_gaming').map(game => (
                    <option key={game.id} value={game.id}>{game.title}</option>
                  ))}
                </select>
                <textarea
                  className="input"
                  style={{ minHeight: '72px', resize: 'vertical', marginTop: 'var(--spacing-sm)' }}
                  placeholder="Guidance for station 3"
                  value={lessonForm.lesson_content.stationGuidance[2] || ''}
                  onChange={e => updateLessonContentListItem('stationGuidance', 2, e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {editingLessonId ? 'Save Changes' : 'Create Lesson'}
                </button>
                <button type="button" onClick={closeLessonModal} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLessonDetailModal && (() => {
        const lesson = lessons.find(item => item.id === lessonDetailId);
        if (!lesson) return null;

        const studentById = new Map(students.map(student => [student.id, student]));
        const schoolNameById = new Map(schools.map(school => [school.id, school.name]));
        const lessonAssignments = studentLessons.filter(assignment => assignment.lesson_id === lesson.id);
        const lessonSessions = schedule.filter(session => session.lesson_id === lesson.id);
        const completedSessions = lessonSessions.filter(session => session.status === 'completed');
        const scheduledSessions = lessonSessions.filter(session => session.status === 'scheduled');
        const cancelledSessions = lessonSessions.filter(session => session.status === 'cancelled');
        const lessonProgressRows = progress.filter(item => item.lesson_id === lesson.id);

        const assignedLearnerIds = new Set(lessonAssignments.map(assignment => assignment.student_id));
        const scheduledLearnerIds = new Set(lessonSessions.map(session => session.student_id));
        const deliveredLearnerIds = new Set(completedSessions.map(session => session.student_id));
        const progressedLearnerIds = new Set(
          lessonProgressRows
            .map(item => item.student_id)
            .filter((studentId): studentId is string => Boolean(studentId))
        );

        const scheduledDates = lessonSessions
          .map(session => session.session_date)
          .filter((value): value is string => Boolean(value))
          .sort();
        const completedDates = completedSessions
          .map(session => session.session_date)
          .filter((value): value is string => Boolean(value))
          .sort();

        const firstScheduledDate = scheduledDates[0] || '';
        const mostRecentScheduledDate = scheduledDates[scheduledDates.length - 1] || '';
        const firstDeliveredDate = completedDates[0] || '';
        const mostRecentDeliveredDate = completedDates[completedDates.length - 1] || '';

        type LessonSchoolBreakdown = {
          schoolId: string;
          schoolName: string;
          assignedLearnerIds: Set<string>;
          scheduledLearnerIds: Set<string>;
          deliveredLearnerIds: Set<string>;
          scheduledSessions: number;
          completedSessions: number;
          cancelledSessions: number;
        };

        const schoolBreakdownMap = new Map<string, LessonSchoolBreakdown>();
        const resolveSchool = (studentId: string): { schoolId: string; schoolName: string } => {
          const schoolId = studentById.get(studentId)?.school_id;
          if (!schoolId) return { schoolId: '__unassigned__', schoolName: 'Unassigned / No School' };
          return { schoolId, schoolName: schoolNameById.get(schoolId) || 'Unknown School' };
        };
        const ensureSchoolBreakdown = (schoolId: string, schoolName: string): LessonSchoolBreakdown => {
          const existing = schoolBreakdownMap.get(schoolId);
          if (existing) return existing;
          const created: LessonSchoolBreakdown = {
            schoolId,
            schoolName,
            assignedLearnerIds: new Set<string>(),
            scheduledLearnerIds: new Set<string>(),
            deliveredLearnerIds: new Set<string>(),
            scheduledSessions: 0,
            completedSessions: 0,
            cancelledSessions: 0,
          };
          schoolBreakdownMap.set(schoolId, created);
          return created;
        };

        lessonAssignments.forEach(assignment => {
          const school = resolveSchool(assignment.student_id);
          ensureSchoolBreakdown(school.schoolId, school.schoolName).assignedLearnerIds.add(assignment.student_id);
        });

        lessonSessions.forEach(session => {
          const school = resolveSchool(session.student_id);
          const row = ensureSchoolBreakdown(school.schoolId, school.schoolName);
          row.scheduledLearnerIds.add(session.student_id);
          if (session.status === 'completed') {
            row.deliveredLearnerIds.add(session.student_id);
            row.completedSessions += 1;
          } else if (session.status === 'cancelled') {
            row.cancelledSessions += 1;
          } else {
            row.scheduledSessions += 1;
          }
        });

        const schoolBreakdown = Array.from(schoolBreakdownMap.values())
          .map(row => ({
            schoolId: row.schoolId,
            schoolName: row.schoolName,
            assignedLearners: row.assignedLearnerIds.size,
            scheduledLearners: row.scheduledLearnerIds.size,
            deliveredLearners: row.deliveredLearnerIds.size,
            scheduledSessions: row.scheduledSessions,
            completedSessions: row.completedSessions,
            cancelledSessions: row.cancelledSessions,
          }))
          .sort((a, b) => a.schoolName.localeCompare(b.schoolName));

        const formatCalendarDate = (value?: string): string => {
          if (!value) return '—';
          const parsed = new Date(`${value}T00:00:00`);
          if (Number.isNaN(parsed.getTime())) return '—';
          return parsed.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
        };

        const formatTimestamp = (value?: string): string => {
          if (!value) return '—';
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) return '—';
          return parsed.toLocaleString('en-ZA', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        };

        const deliveryStatusTone: 'good' | 'warn' | 'neutral' =
          completedSessions.length > 0 ? 'good' : lessonSessions.length > 0 ? 'warn' : 'neutral';
        const deliveryStatusLabel =
          completedSessions.length > 0 ? 'Delivered' : lessonSessions.length > 0 ? 'Scheduled only' : 'Not delivered';

        return (
          <div className="modal">
            <div className="modal-content" style={{ maxWidth: 920, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <div>
                  <h2 style={{ margin: 0 }}>Lesson Details</h2>
                  <p style={{ margin: 'var(--spacing-xs) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    {lesson.title}
                  </p>
                </div>
                <button type="button" className="close" aria-label="Close lesson details dialog" onClick={closeLessonDetailModal}>
                  &times;
                </button>
              </div>

              <div className="overview-metrics" style={{ marginBottom: 'var(--spacing-md)' }}>
                <article className="overview-metric-card">
                  <h3>Created</h3>
                  <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>{formatTimestamp(lesson.created_at)}</strong>
                  <p>Lesson record timestamp</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Status</h3>
                  <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                    <span className={`metric-chip metric-chip--${deliveryStatusTone}`}>{deliveryStatusLabel}</span>
                  </strong>
                  <p>Delivery state from session history</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Assigned Learners</h3>
                  <strong>{assignedLearnerIds.size}</strong>
                  <p>Linked via lesson assignments</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Scheduled Learners</h3>
                  <strong>{scheduledLearnerIds.size}</strong>
                  <p>With at least one session planned</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Delivered Learners</h3>
                  <strong>{deliveredLearnerIds.size}</strong>
                  <p>With completed sessions</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Schools Reached</h3>
                  <strong>{schoolBreakdown.filter(row => row.deliveredLearners > 0).length}</strong>
                  <p>Schools with completed delivery</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Total Sessions</h3>
                  <strong>{lessonSessions.length}</strong>
                  <p>{scheduledSessions.length} scheduled, {completedSessions.length} completed, {cancelledSessions.length} cancelled</p>
                </article>
                <article className="overview-metric-card">
                  <h3>Progress Records</h3>
                  <strong>{lessonProgressRows.length}</strong>
                  <p>{progressedLearnerIds.size} learners with tracked gameplay</p>
                </article>
              </div>

              <div className="overview-activity-groups" style={{ marginBottom: 'var(--spacing-md)' }}>
                <article className="overview-activity-card">
                  <h3>Timeline</h3>
                  <ul className="overview-activity-list">
                    <li>
                      <p>Created</p>
                      <span>{formatTimestamp(lesson.created_at)}</span>
                    </li>
                    <li>
                      <p>First scheduled session</p>
                      <span>{formatCalendarDate(firstScheduledDate)}</span>
                    </li>
                    <li>
                      <p>Most recent scheduled session</p>
                      <span>{formatCalendarDate(mostRecentScheduledDate)}</span>
                    </li>
                    <li>
                      <p>First completed session</p>
                      <span>{formatCalendarDate(firstDeliveredDate)}</span>
                    </li>
                    <li>
                      <p>Most recent completed session</p>
                      <span>{formatCalendarDate(mostRecentDeliveredDate)}</span>
                    </li>
                  </ul>
                </article>
                <article className="overview-activity-card">
                  <h3>Delivery Snapshot</h3>
                  <ul className="overview-activity-list">
                    <li>
                      <p>Assigned to learners</p>
                      <span>{assignedLearnerIds.size}</span>
                    </li>
                    <li>
                      <p>Scheduled for learners</p>
                      <span>{scheduledLearnerIds.size}</span>
                    </li>
                    <li>
                      <p>Delivered to learners</p>
                      <span>{deliveredLearnerIds.size}</span>
                    </li>
                    <li>
                      <p>Schools scheduled</p>
                      <span>{schoolBreakdown.filter(row => row.scheduledLearners > 0).length}</span>
                    </li>
                    <li>
                      <p>Schools delivered</p>
                      <span>{schoolBreakdown.filter(row => row.deliveredLearners > 0).length}</span>
                    </li>
                  </ul>
                </article>
              </div>

              <div>
                <h3 style={{ margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>School Delivery Breakdown</h3>
                {schoolBreakdown.length === 0 ? (
                  <p className="overview-activity-empty">No learner assignments or sessions for this lesson yet.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>School</th>
                          <th>Assigned Learners</th>
                          <th>Scheduled Learners</th>
                          <th>Delivered Learners</th>
                          <th>Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolBreakdown.map(row => (
                          <tr key={row.schoolId}>
                            <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{row.schoolName}</td>
                            <td>{row.assignedLearners}</td>
                            <td>{row.scheduledLearners}</td>
                            <td>{row.deliveredLearners}</td>
                            <td>
                              <span style={{ color: 'var(--color-text-secondary)' }}>
                                {row.scheduledSessions} scheduled, {row.completedSessions} completed, {row.cancelledSessions} cancelled
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeLessonDetailModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSchoolModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add School</h2>
              <button type="button" className="close" aria-label="Close add school dialog" onClick={() => setShowSchoolModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddSchool}>
              <div className="form-group">
                <label>School Name *</label>
                <input type="text" name="name" className="input" required placeholder="Enter school name" />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" name="address" className="input" placeholder="Street address, City, Province" />
              </div>
              <div className="form-group">
                <label>Contact Email</label>
                <input type="email" name="contact_email" className="input" placeholder="school@example.com" />
              </div>
              <div className="form-group">
                <label>Contact Phone</label>
                <input type="tel" name="contact_phone" className="input" placeholder="+27 XX XXX XXXX" />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Add School</button>
                <button type="button" onClick={() => setShowSchoolModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── School Detail Modal ────────────────────────────── */}
      {showSchoolDetailModal && (() => {
        const school = schools.find(s => s.id === schoolDetailId);
        if (!school) return null;
        const schoolTeachers = teachers.filter(t => t.school_id === school.id);
        const schoolStudents = students.filter(s => s.school_id === school.id);
        const schoolParents  = parents.filter(p => p.school_id === school.id);
        const tabBtnStyle = (tab: string) => ({
          padding: 'var(--spacing-sm) var(--spacing-lg)',
          background: schoolDetailTab === tab ? 'var(--color-primary)' : 'transparent',
          color: schoolDetailTab === tab ? '#fff' : 'var(--color-text-secondary)',
          border: 'none', cursor: 'pointer', fontWeight: schoolDetailTab === tab ? 600 : 400,
          fontSize: 'var(--font-size-sm)', borderRadius: 'var(--radius-md)',
        } as React.CSSProperties);
        return (
          <div className="modal">
            <div className="modal-content" style={{ maxWidth: 720, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>{school.name}</h2>
                <button type="button" className="close" aria-label="Close school details dialog" onClick={() => setShowSchoolDetailModal(false)}>
                  &times;
                </button>
              </div>

              {/* School info */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {school.address      && <span>{school.address}</span>}
                {school.contact_email && <span><a href={`mailto:${school.contact_email}`} style={{ color: 'var(--color-primary)' }}>{school.contact_email}</a></span>}
                {school.contact_phone && <span>{school.contact_phone}</span>}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-lg)', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', padding: 4 }}>
                <button style={tabBtnStyle('teachers')} onClick={() => setSchoolDetailTab('teachers')}>Teachers ({schoolTeachers.length})</button>
                <button style={tabBtnStyle('students')} onClick={() => setSchoolDetailTab('students')}>Learners ({schoolStudents.length})</button>
                <button style={tabBtnStyle('parents')}  onClick={() => setSchoolDetailTab('parents')}>Parents  ({schoolParents.length})</button>
              </div>

              {/* Teachers tab */}
              {schoolDetailTab === 'teachers' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-md)' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setModalPreschoolId(school.id); setShowTeacherModal(true); }}>
                      + Add Teacher
                    </button>
                  </div>
                  {schoolTeachers.length === 0 ? (
                    <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No teachers assigned to this school yet.</p>
                  ) : (
                    <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                      <tbody>
                        {schoolTeachers.map(t => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{t.name}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{t.email}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => handleDeleteUser(t.id, 'teacher')}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </>
              )}

              {/* Students tab */}
              {schoolDetailTab === 'students' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-md)' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openStudentModal(school.id)}>
                      + Add Learner
                    </button>
                  </div>
                  {schoolStudents.length === 0 ? (
                    <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No learners assigned to this school yet.</p>
                  ) : (
                    <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>Name</th><th>Grade</th><th>Age</th><th>Actions</th></tr></thead>
                      <tbody>
                        {schoolStudents.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{s.name}</td>
                            <td>Grade {s.grade}</td>
                            <td>{s.age}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => handleDeleteStudent(s)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </>
              )}

              {/* Parents tab */}
              {schoolDetailTab === 'parents' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-md)' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setModalPreschoolId(school.id); setShowParentModal(true); }}>
                      + Add Parent
                    </button>
                  </div>
                  {schoolParents.length === 0 ? (
                    <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No parents assigned to this school yet.</p>
                  ) : (
                    <div className="table-scroll">
                    <table className="table">
                      <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                      <tbody>
                        {schoolParents.map(p => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 'var(--font-weight-medium)' }}>{p.name}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>{p.email}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => handleDeleteUser(p.id, 'parent')}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: 'var(--spacing-xl)' }}>
                <button
                  className="btn btn-secondary"
                  style={{ color: 'var(--color-error)', marginRight: 'var(--spacing-xs)' }}
                  onClick={() => handleDeleteSchool(school)}
                >
                  Remove School
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSchoolDetailModal(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showTeacherModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add Teacher</h2>
              <button
                type="button"
                className="close"
                aria-label="Close add teacher dialog"
                onClick={() => { setShowTeacherModal(false); setModalPreschoolId(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddTeacher}>
              <div className="form-group">
                <label>Full Name *</label>
                <input type="text" name="name" className="input" required placeholder="Enter teacher's full name" />
              </div>
              <div className="form-group">
                <label>Email Address *</label>
                <input type="email" name="email" className="input" required placeholder="teacher@example.com" />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input type="password" name="password" className="input" required placeholder="Set a secure password" />
              </div>
              <div className="form-group">
                <label>School</label>
                <select name="school_id" className="input" key={modalPreschoolId} defaultValue={modalPreschoolId}>
                  <option value="">Select a school...</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Add Teacher</button>
                <button type="button" onClick={() => { setShowTeacherModal(false); setModalPreschoolId(''); }} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showParentModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add Parent</h2>
              <button
                type="button"
                className="close"
                aria-label="Close add parent dialog"
                onClick={() => { setShowParentModal(false); setModalPreschoolId(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddParent}>
              <div className="form-group">
                <label>Full Name *</label>
                <input type="text" name="name" className="input" required placeholder="Enter parent's full name" />
              </div>
              <div className="form-group">
                <label>Email Address *</label>
                <input type="email" name="email" className="input" required placeholder="parent@example.com" />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input type="password" name="password" className="input" required placeholder="Set a secure password" />
              </div>
              <div className="form-group">
                <label>School</label>
                <select name="school_id" className="input" key={modalPreschoolId} defaultValue={modalPreschoolId}>
                  <option value="">Select a school...</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Add Parent</button>
                <button type="button" onClick={() => { setShowParentModal(false); setModalPreschoolId(''); }} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Schedule Modal ───────────────────────────── */}
      {showSchedModal && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingSession ? 'Edit Session' : 'Schedule Session'}</h2>
              <button type="button" className="close" aria-label="Close schedule session dialog" onClick={() => setShowSchedModal(false)}>
                &times;
              </button>
            </div>
            <p className="form-help" style={{ marginTop: 0 }}>
              Step {schedWizardStep} of 3:
              {' '}
              {schedWizardStep === 1 ? 'School, date, and learner' : schedWizardStep === 2 ? 'Lesson details' : 'Review'}
            </p>
            <p className="form-help">Draft saves automatically on this device while you work.</p>
            {schedWizardStep === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>School *</label>
                  <select
                    className={`input${scheduleSubmitAttempted && !schedSchoolId ? ' input-invalid' : ''}`}
                    value={schedSchoolId}
                    onChange={e => handleSchedSchoolChange(e.target.value)}
                    aria-invalid={scheduleSubmitAttempted && !schedSchoolId}
                  >
                    <option value="">Select school...</option>
                    {schoolScopeOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <p className="form-help">
                    Choose a school first. Sessions are scheduled per school, then linked to learners in that school.
                  </p>
                </div>

                {editingSession ? (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Learner *</label>
                    <select
                      className={`input${scheduleSubmitAttempted && !schedStudentId ? ' input-invalid' : ''}`}
                      value={schedStudentId}
                      onChange={e => setSchedStudentId(e.target.value)}
                      aria-invalid={scheduleSubmitAttempted && !schedStudentId}
                    >
                      <option value="">Select learner...</option>
                      {schedLearnersForSchool.map(student => (
                        <option key={student.id} value={student.id}>{student.name} (Grade {student.grade})</option>
                      ))}
                    </select>
                    <p className="form-help">Edit mode updates this single learner session.</p>
                  </div>
                ) : (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Learners *</label>
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const nextIds = schedLearnersForSchool.map(student => student.id);
                          setSchedStudentIds(nextIds);
                          setSchedStudentId(nextIds[0] || '');
                        }}
                        disabled={schedLearnersForSchool.length === 0}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSchedStudentIds([]);
                          setSchedStudentId('');
                        }}
                        disabled={schedStudentIds.length === 0}
                      >
                        Clear
                      </button>
                    </div>
                    <div
                      className={`schedule-learner-list${scheduleSubmitAttempted && selectedScheduleStudentIds.length === 0 ? ' input-invalid' : ''}`}
                    >
                      {schedLearnersForSchool.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                          No learners linked to this school yet.
                        </p>
                      ) : (
                        schedLearnersForSchool.map(student => (
                          <label key={student.id} className="schedule-learner-option">
                            <input
                              type="checkbox"
                              checked={selectedScheduleStudentIds.includes(student.id)}
                              onChange={() => toggleSchedStudent(student.id)}
                            />
                            <span>{student.name} (Grade {student.grade})</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="form-help">
                      Creates one session per selected learner in the selected school.
                    </p>
                  </div>
                )}
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    className={`input${scheduleSubmitAttempted && !schedDate ? ' input-invalid' : ''}`}
                    value={schedDate}
                    onChange={e => setSchedDate(e.target.value)}
                    aria-invalid={scheduleSubmitAttempted && !schedDate}
                  />
                </div>
                <div className="form-group">
                  <label>Start time *</label>
                  <input
                    type="time"
                    className={`input${scheduleSubmitAttempted && !schedStart ? ' input-invalid' : ''}`}
                    value={schedStart}
                    onChange={e => setSchedStart(e.target.value)}
                    aria-invalid={scheduleSubmitAttempted && !schedStart}
                  />
                </div>
                <div className="form-group">
                  <label>End time</label>
                  <input
                    type="time"
                    className={`input${schedEnd && schedEnd <= schedStart ? ' input-invalid' : ''}`}
                    value={schedEnd}
                    onChange={e => setSchedEnd(e.target.value)}
                    aria-invalid={!!(schedEnd && schedEnd <= schedStart)}
                  />
                  <p className="form-help">Optional. Leave blank for open-ended sessions.</p>
                </div>
              </div>
            )}
            {schedWizardStep === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                <div className="form-group">
                  <label>Lesson (optional)</label>
                  <select className="input" value={schedLessonId} onChange={e => setSchedLessonId(e.target.value)}>
                    <option value="">No lesson selected</option>
                    {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                </div>
                {!editingSession && (
                  <div className="form-group">
                    <label>Repeat weekly for</label>
                    <select className="input" value={schedRecurWeeks} onChange={e => setSchedRecurWeeks(parseInt(e.target.value, 10))}>
                      <option value={0}>No repeat (one session)</option>
                      {[1,2,3,4,5,6,7,8,9,10,11].map(w => <option key={w} value={w}>{w} more week{w > 1 ? 's' : ''} ({w + 1} total)</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Session title (optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Typing practice, Introduction to algorithms..."
                    value={schedTitle}
                    onChange={e => setSchedTitle(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes (optional)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Preparation notes or context for this session..."
                    value={schedNotes}
                    onChange={e => setSchedNotes(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'var(--font-family)' }}
                  />
                </div>
              </div>
            )}
            {schedWizardStep === 3 && (
              <div className="card" style={{ padding: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>
                  Review Session
                </h3>
                <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                  <strong>School:</strong> {schedSchoolId ? getSchoolLabelForScope(schedSchoolId) : '—'}
                </p>
                <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                  <strong>{editingSession ? 'Learner' : 'Learners'}:</strong>{' '}
                  {editingSession
                    ? (students.find(s => s.id === schedStudentId)?.name || '—')
                    : (selectedScheduleStudentIds
                        .map(id => students.find(student => student.id === id)?.name)
                        .filter((name): name is string => Boolean(name))
                        .join(', ') || '—')}
                </p>
                <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                  <strong>Date:</strong> {schedDate || '—'}
                </p>
                <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                  <strong>Time:</strong> {schedStart || '—'}{schedEnd ? ` - ${schedEnd}` : ''}
                </p>
                <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                  <strong>Lesson:</strong> {lessons.find(l => l.id === schedLessonId)?.title || 'No lesson'}
                </p>
                {schedTitle && (
                  <p style={{ margin: '0 0 var(--spacing-xs)' }}>
                    <strong>Title:</strong> {schedTitle}
                  </p>
                )}
                {schedNotes && (
                  <p style={{ margin: 0 }}>
                    <strong>Notes:</strong> {schedNotes}
                  </p>
                )}
              </div>
            )}
            {scheduleSubmitAttempted && scheduleValidationError && (
              <p className="form-error" role="status">{scheduleValidationError}</p>
            )}
            <div className="modal-actions">
              {schedWizardStep > 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => setSchedWizardStep(prev => prev - 1)}>
                  Back
                </button>
              )}
              {schedWizardStep < 3 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setScheduleSubmitAttempted(true);
                    if (schedWizardStep === 1 && !canSaveSchedule) return;
                    setSchedWizardStep(prev => prev + 1);
                  }}
                >
                  Next
                </button>
              )}
              {schedWizardStep === 3 && (
                <button className="btn btn-primary" onClick={handleSaveSession} disabled={!canSaveSchedule}>
                  {editingSession ? 'Save Changes' : 'Schedule Session'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setShowSchedModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes Modal ─────────────────────────────── */}
      {showNotesModal && (() => {
        const student = students.find(s => s.id === notesStudentId);
        return (
          <div className="modal">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Session Notes — {student?.name}</h2>
                <button
                  type="button"
                  className="close"
                  aria-label="Close session notes dialog"
                  onClick={() => { setShowNotesModal(false); setEditingNoteId(null); }}
                >
                  &times;
                </button>
              </div>

              {/* Add / Edit form */}
              <p className="form-help" style={{ marginTop: 0, marginBottom: 'var(--spacing-md)' }}>
                Draft saves automatically on this device until you submit.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--spacing-sm)', alignItems: 'end', marginBottom: 'var(--spacing-lg)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Session date</label>
                  <input type="date" className="input" value={noteDate} onChange={e => setNoteDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                <label>{editingNoteId ? 'Edit note' : 'New session note'}</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="What did the learner work on today? Any observations, challenges, or next steps..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-family)' }}
                />
              </div>
              <div className="modal-actions" style={{ marginBottom: 'var(--spacing-xl)' }}>
                <button className="btn btn-primary" onClick={handleSaveNote} disabled={!noteText.trim()}>
                  {editingNoteId ? 'Save Changes' : 'Add Note'}
                </button>
                {editingNoteId && (
                  <button className="btn btn-secondary" onClick={() => { setEditingNoteId(null); setNoteText(''); setNoteDate(new Date().toISOString().split('T')[0]); }}>
                    Cancel edit
                  </button>
                )}
              </div>

              {/* Existing notes */}
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-md)' }}>
                Previous notes
              </h3>
              {notesLoading ? (
                <p style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
              ) : notes.length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No notes yet. Add the first one above.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: 'var(--color-background)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xs)' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                          {new Date(n.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditNote(n)}>Edit</button>
                          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteNote(n.id)}>Delete</button>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{n.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* ── Done-with-Note Modal ─────────────────────────────── */}
      {showDoneModal && (() => {
        const session = schedule.find(s => s.id === doneSessionId);
        return (
          <div className="modal">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Complete session — {session?.student_name}</h2>
                <button type="button" className="close" aria-label="Close complete session dialog" onClick={() => setShowDoneModal(false)}>
                  &times;
                </button>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-lg)' }}>
                {session?.session_date} &middot; {session?.start_time}{session?.end_time ? ` - ${session.end_time}` : ''}
                {session?.lesson_title && <> &middot; {session.lesson_title}</>}
              </p>
              <p className="form-help" style={{ marginTop: 0, marginBottom: 'var(--spacing-md)' }}>
                Draft saves automatically on this device until you submit.
              </p>
              <div className="form-group">
                <label>Session date</label>
                <input type="date" className="input" value={doneNoteDate} onChange={e => setDoneNoteDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Session note <span style={{ fontWeight: 'var(--font-weight-normal)', color: 'var(--color-text-tertiary)' }}>(optional)</span></label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="What did the learner work on? Observations, progress, next steps..."
                  value={doneNoteText}
                  onChange={e => setDoneNoteText(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-family)' }}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleMarkDoneWithNote}>
                  Mark complete{doneNoteText.trim() ? ' & save note' : ''}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowDoneModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Student Profile Modal ─────────────────────────────── */}
      {showProfileModal && (() => {
        const student = students.find(s => s.id === profileStudentId);
        const studentSessions = schedule.filter(s => s.student_id === profileStudentId).sort((a, b) => b.session_date.localeCompare(a.session_date));
        const assignedLessons = getSortedAssignmentsForStudent(profileStudentId);
        const assignedLessonIds = new Set(assignedLessons.map(assignment => assignment.lesson_id));
        const completed = profileProgress.filter(p => p.completed).length;
        const avgScore = profileProgress.length > 0 ? Math.round(profileProgress.reduce((s, p) => s + (p.score || 0), 0) / profileProgress.length) : 0;
        const upcomingSessions = studentSessions.filter(s => s.status === 'scheduled' && s.session_date >= _today);

        const timelineItems: ProfileTimelineItem[] = [
          ...studentSessions.map(session => ({
            id: `session-${session.id}`,
            date: `${session.session_date}T${session.start_time || '00:00'}`,
            type: 'session' as const,
            title: `Session ${session.status}`,
            detail: `${session.session_date} ${session.start_time}${session.end_time ? ` - ${session.end_time}` : ''} · ${session.lesson_title || session.title || 'No lesson title'}`,
            statusColor:
              session.status === 'completed'
                ? 'var(--color-success)'
                : session.status === 'cancelled'
                  ? 'var(--color-error)'
                  : 'var(--color-primary)',
          })),
          ...profileNotes.map(note => ({
            id: `note-${note.id}`,
            date: `${note.session_date}T12:00`,
            type: 'note' as const,
            title: 'Tutor note added',
            detail: note.note,
            statusColor: 'var(--color-text-secondary)',
          })),
          ...profileProgress.map(item => ({
            id: `progress-${item.id}`,
            date: item.created_at,
            type: 'progress' as const,
            title: `Played ${item.game_title}`,
            detail: `Score ${item.score ?? 0}% · ${item.completed ? 'Completed' : 'In progress'} · ${item.attempts} attempt${item.attempts === 1 ? '' : 's'}`,
            statusColor: item.completed ? 'var(--color-success)' : 'var(--color-warning)',
          })),
        ];

        if (assignedLessons.length === 0) {
          timelineItems.push({
            id: 'alert-no-lesson',
            date: `${_today}T23:58`,
            type: 'alert',
            title: 'Alert: no lessons assigned',
            detail: 'Assign at least one lesson so this learner has a clear next activity path.',
            statusColor: 'var(--color-error)',
          });
        }
        if (upcomingSessions.length === 0) {
          timelineItems.push({
            id: 'alert-no-upcoming-session',
            date: `${_today}T23:57`,
            type: 'alert',
            title: 'Alert: no upcoming sessions',
            detail: 'Schedule a future session to maintain learning continuity.',
            statusColor: 'var(--color-warning)',
          });
        }
        if (profileProgress.length > 0 && avgScore < 60) {
          timelineItems.push({
            id: 'alert-low-score',
            date: `${_today}T23:56`,
            type: 'alert',
            title: 'Alert: average score below 60%',
            detail: 'Consider support notes and targeted lesson reassignment.',
            statusColor: 'var(--color-warning)',
          });
        }

        timelineItems.sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div className="modal">
            <div className="modal-content learner-profile-modal-content" style={{ maxWidth: 760, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>{student?.name} — Profile</h2>
                <button type="button" className="close" aria-label="Close learner profile dialog" onClick={() => setShowProfileModal(false)}>
                  &times;
                </button>
              </div>

              {/* Quick stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                {[{ label: 'Grade', val: `Grade ${student?.grade}` }, { label: 'Games played', val: profileProgress.length }, { label: 'Completed', val: completed }, { label: 'Avg score', val: `${avgScore}%` }].map(c => (
                  <div key={c.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-sm) var(--spacing-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary)' }}>{c.val}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>
                  Learner Links
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>School</label>
                    <select className="input" value={profileSchoolId} onChange={e => setProfileSchoolId(e.target.value)}>
                      <option value="">No school assigned</option>
                      {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Teacher</label>
                    <select className="input" value={profileTeacherId} onChange={e => setProfileTeacherId(e.target.value)}>
                      <option value="">No teacher assigned</option>
                      {teachers
                        .filter(teacher => !profileSchoolId || teacher.school_id === profileSchoolId)
                        .map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label>Parent</label>
                    <select className="input" value={profileParentId} onChange={e => setProfileParentId(e.target.value)}>
                      <option value="">No parent linked</option>
                      {parents
                        .filter(parent => !profileSchoolId || parent.school_id === profileSchoolId)
                        .map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleSaveProfileLinks} disabled={profileSavingLinks}>
                    {profileSavingLinks ? 'Saving links...' : 'Save Links'}
                  </button>
                  {student && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: 'var(--color-error)' }}
                      onClick={() => handleDeleteStudent(student)}
                    >
                      Remove Learner
                    </button>
                  )}
                </div>
              </div>

              {/* Assigned lessons */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>Assigned Lessons</h3>
                <div className="lesson-assignment-cell">
                  <div className="lesson-assignment-list">
                    {assignedLessons.length === 0 ? (
                      <span className="lesson-assignment-empty">No lessons assigned yet.</span>
                    ) : (
                      assignedLessons.map(assignment => (
                        <span key={assignment.id} className="lesson-assignment-chip">
                          <span className="lesson-assignment-chip-title">{assignment.lesson_title}</span>
                          <button
                            type="button"
                            className="lesson-assignment-remove"
                            aria-label={`Unassign ${assignment.lesson_title} from ${student?.name || 'learner'}`}
                            onClick={() => handleRemoveLessonSelection(profileStudentId, assignment)}
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="lesson-assignment-controls">
                    <select
                      className="input lesson-assignment-select"
                      defaultValue=""
                      onChange={e => {
                        const nextLessonId = e.target.value;
                        if (!nextLessonId) return;
                        void handleAddLessonSelection(profileStudentId, nextLessonId);
                        e.target.value = '';
                      }}
                      aria-label={`Add lesson for ${student?.name || 'learner'}`}
                      disabled={lessonAssignmentSavingId === profileStudentId || lessons.length === 0}
                    >
                      <option value="">Add lesson...</option>
                      {lessons.map(lesson => (
                        <option
                          key={lesson.id}
                          value={lesson.id}
                          disabled={assignedLessonIds.has(lesson.id)}
                        >
                          {lesson.title}{assignedLessonIds.has(lesson.id) ? ' (assigned)' : ''}
                        </option>
                      ))}
                    </select>
                    {lessonAssignmentSavingId === profileStudentId && (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Saving...</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>
                  Learner Timeline ({timelineItems.length})
                </h3>
                {timelineItems.length === 0 ? (
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                    No timeline events yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    {timelineItems.map(item => (
                      <div
                        key={item.id}
                        style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--spacing-sm) var(--spacing-md)',
                          background: item.type === 'alert' ? '#fff7ed' : 'var(--color-background)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--spacing-sm)', marginBottom: 4 }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: item.statusColor || 'var(--color-text-primary)' }}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                            {new Date(item.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sessions */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>Sessions ({studentSessions.length})</h3>
                {studentSessions.length === 0 ? (
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No sessions scheduled yet.</p>
                ) : (
                  <table className="table" style={{ marginBottom: 0 }}>
                    <thead><tr><th>Date</th><th>Time</th><th>Lesson</th><th>Status</th></tr></thead>
                    <tbody>
                      {studentSessions.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{new Date(s.session_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                          <td style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.start_time}{s.end_time ? ` - ${s.end_time}` : ''}</td>
                          <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{s.lesson_title || s.title || '—'}</td>
                          <td>
                            <span className={`session-status-pill ${s.status}`}>
                              {getSessionStatusLabel(s.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Progress */}
              <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>Game Progress ({profileProgress.length})</h3>
                {profileLoading ? <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>Loading...</p> : profileProgress.length === 0 ? (
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No activity recorded yet.</p>
                ) : (
                  <table className="table" style={{ marginBottom: 0 }}>
                    <thead><tr><th>Game</th><th>Category</th><th>Score</th><th>Status</th><th>Attempts</th></tr></thead>
                    <tbody>
                      {profileProgress.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 'var(--font-size-sm)' }}>{p.game_title}</td>
                          <td><span className={`badge badge-${p.category.replace('_', '-')}`}>{p.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span></td>
                          <td style={{ fontWeight: 600 }}>{p.score ?? 0}%</td>
                          <td style={{ color: p.completed ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 500 }}>{p.completed ? 'Completed' : 'In progress'}</td>
                          <td style={{ color: 'var(--color-text-secondary)' }}>{p.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Notes */}
              <div>
                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)', marginBottom: 'var(--spacing-sm)' }}>Session Notes ({profileNotes.length})</h3>
                {profileLoading ? <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>Loading...</p> : profileNotes.length === 0 ? (
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No notes yet. Use &quot;Complete + Note&quot; on the schedule to add session notes.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    {profileNotes.map(n => (
                      <div key={n.id} style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{new Date(n.session_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowProfileModal(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
      {showAnalyticsExportModal && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="analytics-export-modal-title">
          <div className="modal-content" style={{ maxWidth: 760, width: '95vw' }}>
            <div className="modal-header">
              <h2 id="analytics-export-modal-title">Export Analytics Data</h2>
              <button
                type="button"
                className="close"
                aria-label="Close export dialog"
                onClick={() => setShowAnalyticsExportModal(false)}
              >
                ×
              </button>
            </div>
            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Select one or more datasets and choose a file format. Each selected dataset downloads as a separate file.
            </p>

            <div style={{ display: 'grid', gap: 'var(--spacing-lg)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <h3 style={{ margin: '0 0 var(--spacing-sm) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)' }}>
                  Datasets
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  {ANALYTICS_EXPORT_DATASET_OPTIONS.map(option => (
                    <label
                      key={option.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={analyticsExportSelections[option.id]}
                        onChange={() => toggleAnalyticsExportSelection(option.id)}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>{option.label}</strong>
                        <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0 0 var(--spacing-sm) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--letter-spacing-wider)' }}>
                  File Format
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="analytics-export-format"
                      value="csv"
                      checked={analyticsExportFormat === 'csv'}
                      onChange={() => setAnalyticsExportFormat('csv')}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>CSV</strong>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Spreadsheet-ready export</span>
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="analytics-export-format"
                      value="json"
                      checked={analyticsExportFormat === 'json'}
                      onChange={() => setAnalyticsExportFormat('json')}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>JSON</strong>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Structured raw export</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAnalyticsExportModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={runAnalyticsExport} disabled={selectedAnalyticsExportCount === 0}>
                Download {selectedAnalyticsExportCount > 0 ? `(${selectedAnalyticsExportCount})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
      {noticeDialog.isOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="notice-dialog-title">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 id="notice-dialog-title">{noticeDialog.title}</h2>
              <button
                type="button"
                className="close"
                aria-label="Close notice dialog"
                onClick={closeNoticeDialog}
              >
                ×
              </button>
            </div>
            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>{noticeDialog.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={closeNoticeDialog}
                style={
                  noticeDialog.tone === 'danger'
                    ? { background: 'var(--color-error)', borderColor: 'var(--color-error)' }
                    : noticeDialog.tone === 'success'
                      ? { background: 'var(--color-success)', borderColor: 'var(--color-success)' }
                      : undefined
                }
              >
                {noticeDialog.dismissLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog.isOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 id="confirm-dialog-title">{confirmDialog.title}</h2>
              <button
                type="button"
                className="close"
                aria-label="Close confirmation dialog"
                onClick={() => resolveConfirmation(false)}
              >
                ×
              </button>
            </div>
            <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>{confirmDialog.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => resolveConfirmation(false)}>
                {confirmDialog.cancelLabel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => resolveConfirmation(true)}
                style={confirmDialog.tone === 'danger' ? { background: 'var(--color-error)', borderColor: 'var(--color-error)' } : undefined}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingUndoAction && (
        <div className="undo-toast" role="status" aria-live="polite">
          <p>{pendingUndoAction.message} Undo within 5 seconds.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={undoPendingAction}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
};

export default TutorDashboard;
