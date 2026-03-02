import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb, all, get, run } from '../database';
import { getJwtSecret } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();
const JWT_SECRET = getJwtSecret();

interface DecodedActorToken {
  userId?: string;
  studentId?: string;
  role?: string;
  preview?: boolean;
}

type StationCategory = 'computational_thinking' | 'typing' | 'purposeful_gaming';

interface SchoolRow {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  name: string;
  school_id: string | null;
  teacher_id: string | null;
  parent_id: string | null;
}

interface UserRoleRow {
  id: string;
  role: 'teacher' | 'parent';
  school_id: string | null;
}

interface SessionRow {
  id: string;
  student_id: string;
  status: string;
  session_date: string;
  parent_confirmed: number | null;
}

interface StudentLessonRow {
  student_id: string;
  lesson_id: string;
  lesson_title: string;
}

interface ProgressRow {
  id: string;
  student_id: string | null;
  student_name: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  category: string | null;
  score: number | null;
  completed: number | boolean | null;
  attempts: number | null;
  time_spent: number | null;
  created_at: string | null;
  updated_at: string | null;
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

const getActorFromAuthorization = (authorizationHeader: string | undefined): DecodedActorToken => {
  if (!authorizationHeader?.startsWith('Bearer ')) return {};
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return {};

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedActorToken;
    if (!decoded || typeof decoded !== 'object') return {};
    return decoded;
  } catch {
    return {};
  }
};

const STATION_CATEGORIES: StationCategory[] = [
  'computational_thinking',
  'typing',
  'purposeful_gaming',
];

const STATION_CATEGORY_LABELS: Record<StationCategory, string> = {
  computational_thinking: 'Computational Thinking',
  typing: 'Typing',
  purposeful_gaming: 'Purposeful Gaming',
};

const toPercent = (numerator: number, denominator: number): number => (
  denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
);

const isCompletedFlag = (value: number | boolean | null | undefined): boolean =>
  value === true || value === 1;

const toIsoDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
};

// POST /api/analytics/event
// Auth is optional so login failures can still be recorded.
router.post('/event', async (req, res) => {
  try {
    const eventName = typeof req.body?.event_name === 'string' ? req.body.event_name.trim() : '';
    const pagePath = typeof req.body?.page_path === 'string' ? req.body.page_path.trim() : '';
    const bodyRole = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : '';
    const properties = req.body?.properties ?? null;

    if (!eventName) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    if (eventName.length > 120) {
      return res.status(400).json({ error: 'event_name is too long (max 120 characters)' });
    }

    const actor = getActorFromAuthorization(req.headers.authorization);
    if (actor.role === 'learner' && actor.preview === true) {
      return res.status(202).json({
        recorded: false,
        skipped: true,
        reason: 'learner_preview_session',
      });
    }

    const resolvedRole = actor.role || bodyRole || 'anonymous';
    const userId = actor.userId || null;
    const studentId = actor.studentId || null;

    const propertiesPayload = {
      ...(properties && typeof properties === 'object' ? properties : {}),
      user_agent: req.headers['user-agent'] || null,
      ip: req.ip,
    };
    const serializedProperties = JSON.stringify(propertiesPayload);

    if (serializedProperties.length > 10000) {
      return res.status(400).json({ error: 'Event properties are too large' });
    }

    const db = getDb();

    if (userId) {
      const user = await get(db, 'SELECT id FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.status(401).json({ error: 'Invalid user token' });
      }
    }

    if (studentId) {
      const student = await get(db, 'SELECT id FROM students WHERE id = ?', [studentId]);
      if (!student) {
        return res.status(401).json({ error: 'Invalid learner token' });
      }
    }

    const id = uuidv4();
    await run(
      db,
      `INSERT INTO analytics_events (id, event_name, user_id, student_id, role, page_path, properties)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, eventName, userId, studentId, resolvedRole, pagePath || null, serializedProperties]
    );

    res.status(201).json({ id, recorded: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/operations-overview
// Returns a database-sourced snapshot used by the tutor Operations Overview UI.
router.get('/operations-overview', authenticate, requireRole('tutor'), async (_req: AuthRequest, res) => {
  try {
    const db = getDb();

    const [
      schoolsRows,
      studentsRows,
      usersRows,
      sessionsRows,
      studentLessonsRows,
      progressRows,
    ] = await Promise.all([
      all(db, 'SELECT id, name FROM schools ORDER BY name ASC'),
      all(db, 'SELECT id, name, school_id, teacher_id, parent_id FROM students'),
      all(db, "SELECT id, role, school_id FROM users WHERE role IN ('teacher', 'parent')"),
      all(db, 'SELECT id, student_id, status, session_date, parent_confirmed FROM sessions'),
      all(
        db,
        `SELECT sl.student_id, sl.lesson_id, COALESCE(l.title, 'Untitled lesson') AS lesson_title
           FROM student_lessons sl
           LEFT JOIN lessons l ON l.id = sl.lesson_id`
      ),
      all(
        db,
        `SELECT p.id, p.student_id, p.lesson_id, p.score, p.completed, p.attempts, p.time_spent, p.created_at, p.updated_at,
                g.category,
                l.title AS lesson_title,
                s.name AS student_name
           FROM progress p
           LEFT JOIN games g ON g.id = p.game_id
           LEFT JOIN lessons l ON l.id = p.lesson_id
           LEFT JOIN students s ON s.id = p.student_id`
      ),
    ]);

    const schools = schoolsRows as SchoolRow[];
    const students = studentsRows as StudentRow[];
    const users = usersRows as UserRoleRow[];
    const sessions = sessionsRows as SessionRow[];
    const studentLessons = studentLessonsRows as StudentLessonRow[];
    const progress = progressRows as ProgressRow[];

    type SchoolScope = {
      school_id: string;
      school_name: string;
      learner_ids: string[];
      teacher_ids: string[];
      parent_ids: string[];
    };

    const schoolScopes: SchoolScope[] = schools.map((school) => ({
      school_id: school.id,
      school_name: school.name,
      learner_ids: [],
      teacher_ids: [],
      parent_ids: [],
    }));

    const scopeById = new Map<string, SchoolScope>(
      schoolScopes.map((scope) => [scope.school_id, scope])
    );

    const unassignedScope: SchoolScope = {
      school_id: '__unassigned__',
      school_name: 'Unassigned / No School',
      learner_ids: [],
      teacher_ids: [],
      parent_ids: [],
    };

    students.forEach((student) => {
      const schoolId = student.school_id || '';
      const targetScope = schoolId ? scopeById.get(schoolId) : null;
      if (targetScope) {
        targetScope.learner_ids.push(student.id);
      } else {
        unassignedScope.learner_ids.push(student.id);
      }
    });

    users.forEach((user) => {
      const schoolId = user.school_id || '';
      const targetScope = schoolId ? scopeById.get(schoolId) : null;
      const roleTarget = user.role === 'teacher' ? 'teacher_ids' : 'parent_ids';
      if (targetScope) {
        targetScope[roleTarget].push(user.id);
      } else {
        unassignedScope[roleTarget].push(user.id);
      }
    });

    if (
      unassignedScope.learner_ids.length > 0 ||
      unassignedScope.teacher_ids.length > 0 ||
      unassignedScope.parent_ids.length > 0
    ) {
      schoolScopes.push(unassignedScope);
    }

    schoolScopes.sort((a, b) => a.school_name.localeCompare(b.school_name));

    const studentById = new Map(students.map((student) => [student.id, student]));
    const schoolByLearnerId = new Map<string, { school_id: string; school_name: string }>();

    schoolScopes.forEach((scope) => {
      scope.learner_ids.forEach((learnerId) => {
        schoolByLearnerId.set(learnerId, {
          school_id: scope.school_id,
          school_name: scope.school_name,
        });
      });
    });

    const today = new Date().toISOString().split('T')[0];

    const schoolOutcomeRows: SchoolOutcomeSummaryRow[] = schoolScopes.map((scope) => {
      const learnerSet = new Set(scope.learner_ids);
      const schoolSessions = sessions.filter((session) => learnerSet.has(session.student_id));
      const schoolProgress = progress.filter(
        (item) => Boolean(item.student_id) && learnerSet.has(item.student_id as string)
      );
      const schoolAssignments = studentLessons.filter((assignment) => learnerSet.has(assignment.student_id));

      const sessionsCompleted = schoolSessions.filter((session) => session.status === 'completed').length;
      const sessionsCancelled = schoolSessions.filter((session) => session.status === 'cancelled').length;
      const sessionsUpcoming = schoolSessions.filter(
        (session) => session.status === 'scheduled' && session.session_date >= today
      ).length;
      const sessionsOverdue = schoolSessions.filter(
        (session) => session.status === 'scheduled' && session.session_date < today
      ).length;

      const attendanceDenominator = sessionsCompleted + sessionsCancelled + sessionsOverdue;
      const parentConfirmedSessions = schoolSessions.filter(
        (session) => Number(session.parent_confirmed ?? 0) === 1
      ).length;
      const confirmableSessions = schoolSessions.filter((session) => session.status !== 'cancelled').length;

      const gameAttempts = schoolProgress.length;
      const gameCompletions = schoolProgress.filter((item) => isCompletedFlag(item.completed)).length;
      const totalGameScore = schoolProgress.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
      const totalTimeSpent = schoolProgress.reduce((sum, item) => sum + Number(item.time_spent ?? 0), 0);

      const learnersWithTeacher = scope.learner_ids.filter((learnerId) =>
        Boolean(studentById.get(learnerId)?.teacher_id)
      ).length;
      const learnersWithParent = scope.learner_ids.filter((learnerId) =>
        Boolean(studentById.get(learnerId)?.parent_id)
      ).length;
      const learnersWithLessonPlan = new Set(schoolAssignments.map((assignment) => assignment.student_id)).size;

      const activeLearners = new Set<string>([
        ...schoolSessions.map((session) => session.student_id),
        ...schoolProgress
          .map((item) => item.student_id || '')
          .filter((studentId): studentId is string => studentId.length > 0),
      ]);

      const activeTeachers = new Set<string>(
        Array.from(activeLearners)
          .map((learnerId) => studentById.get(learnerId)?.teacher_id || '')
          .filter((teacherId): teacherId is string => teacherId.length > 0)
      );

      const activeParents = new Set<string>(
        schoolSessions
          .filter((session) => Number(session.parent_confirmed ?? 0) === 1)
          .map((session) => studentById.get(session.student_id)?.parent_id || '')
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
        session_attendance_rate: toPercent(sessionsCompleted, attendanceDenominator),
        parent_confirmed_sessions: parentConfirmedSessions,
        parent_confirmation_rate: toPercent(parentConfirmedSessions, confirmableSessions),
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
    });

    type LearnerLessonAggregate = {
      school_id: string;
      school_name: string;
      lesson_id: string;
      lesson_title: string;
      learner_id: string;
      games_attempted: number;
      games_completed: number;
      score_total: number;
      total_attempts: number;
      total_time_spent: number;
    };

    const learnerLessonMap = new Map<string, LearnerLessonAggregate>();

    const ensureLearnerLessonRow = (
      schoolId: string,
      schoolName: string,
      lessonId: string,
      lessonTitle: string,
      learnerId: string
    ): LearnerLessonAggregate => {
      const key = `${schoolId}::${lessonId}::${learnerId}`;
      const existing = learnerLessonMap.get(key);
      if (existing) return existing;

      const created: LearnerLessonAggregate = {
        school_id: schoolId,
        school_name: schoolName,
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        learner_id: learnerId,
        games_attempted: 0,
        games_completed: 0,
        score_total: 0,
        total_attempts: 0,
        total_time_spent: 0,
      };
      learnerLessonMap.set(key, created);
      return created;
    };

    studentLessons.forEach((assignment) => {
      const school = schoolByLearnerId.get(assignment.student_id);
      if (!school) return;

      ensureLearnerLessonRow(
        school.school_id,
        school.school_name,
        assignment.lesson_id,
        assignment.lesson_title || 'Untitled lesson',
        assignment.student_id
      );
    });

    progress.forEach((item) => {
      const learnerId = item.student_id || '';
      const lessonId = item.lesson_id || '';
      if (!learnerId || !lessonId) return;

      const school = schoolByLearnerId.get(learnerId);
      if (!school) return;

      const row = ensureLearnerLessonRow(
        school.school_id,
        school.school_name,
        lessonId,
        item.lesson_title || 'Untitled lesson',
        learnerId
      );

      row.games_attempted += 1;
      if (isCompletedFlag(item.completed)) row.games_completed += 1;
      row.score_total += Number(item.score ?? 0);
      row.total_attempts += Number(item.attempts ?? 0);
      row.total_time_spent += Number(item.time_spent ?? 0);
    });

    const lessonSummaryMap = new Map<
      string,
      SchoolLessonSummaryRow & {
        weighted_score_sum: number;
      }
    >();

    Array.from(learnerLessonMap.values()).forEach((learnerRow) => {
      const key = `${learnerRow.school_id}::${learnerRow.lesson_id}`;
      const averageCorrect =
        learnerRow.games_attempted > 0
          ? Math.round(learnerRow.score_total / learnerRow.games_attempted)
          : 0;
      const existing = lessonSummaryMap.get(key);

      if (existing) {
        existing.learners_assigned += 1;
        if (learnerRow.games_attempted > 0) existing.learners_active += 1;
        existing.games_attempted += learnerRow.games_attempted;
        existing.games_completed += learnerRow.games_completed;
        existing.total_attempts += learnerRow.total_attempts;
        existing.total_time_spent_seconds += learnerRow.total_time_spent;
        existing.weighted_score_sum += averageCorrect * learnerRow.games_attempted;
        return;
      }

      lessonSummaryMap.set(key, {
        school_id: learnerRow.school_id,
        school_name: learnerRow.school_name,
        lesson_id: learnerRow.lesson_id,
        lesson_title: learnerRow.lesson_title,
        learners_assigned: 1,
        learners_active: learnerRow.games_attempted > 0 ? 1 : 0,
        games_attempted: learnerRow.games_attempted,
        games_completed: learnerRow.games_completed,
        completion_rate_percent: 0,
        average_correct_responses_percent: 0,
        total_attempts: learnerRow.total_attempts,
        total_time_spent_seconds: learnerRow.total_time_spent,
        weighted_score_sum: averageCorrect * learnerRow.games_attempted,
      });
    });

    const lessonSummaryRows: SchoolLessonSummaryRow[] = Array.from(lessonSummaryMap.values())
      .map((row) => ({
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
        const schoolCompare = a.school_name.localeCompare(b.school_name);
        if (schoolCompare !== 0) return schoolCompare;
        return a.lesson_title.localeCompare(b.lesson_title);
      });

    type StationLearnerMetric = {
      first_score: number;
      first_activity: string;
      latest_score: number;
      latest_activity: string;
      attempts: number;
      completions: number;
    };

    const stationCategoryMap = new Map<StationCategory, Map<string, StationLearnerMetric>>();
    STATION_CATEGORIES.forEach((category) => stationCategoryMap.set(category, new Map()));

    progress.forEach((item) => {
      const rawCategory = item.category;
      if (!rawCategory || !STATION_CATEGORIES.includes(rawCategory as StationCategory)) return;
      const category = rawCategory as StationCategory;

      const learnerKey = item.student_id || (item.student_name || '').trim().toLowerCase();
      if (!learnerKey) return;

      const activityDate = toIsoDate(item.updated_at || item.created_at);
      if (!activityDate) return;

      const categoryRows = stationCategoryMap.get(category);
      if (!categoryRows) return;

      const score = Number(item.score ?? 0);
      const existing = categoryRows.get(learnerKey);

      if (existing) {
        existing.attempts += 1;
        if (isCompletedFlag(item.completed)) existing.completions += 1;

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

      categoryRows.set(learnerKey, {
        first_score: score,
        first_activity: activityDate,
        latest_score: score,
        latest_activity: activityDate,
        attempts: 1,
        completions: isCompletedFlag(item.completed) ? 1 : 0,
      });
    });

    const stationImprovementRows: StationImprovementRow[] = STATION_CATEGORIES.map((category) => {
      const metrics = Array.from((stationCategoryMap.get(category) || new Map()).values());
      const measured = metrics.filter((metric) => metric.attempts > 1);

      const totalAttempts = metrics.reduce((sum, metric) => sum + metric.attempts, 0);
      const totalCompletions = metrics.reduce((sum, metric) => sum + metric.completions, 0);
      const baselineSum = measured.reduce((sum, metric) => sum + metric.first_score, 0);
      const latestSum = measured.reduce((sum, metric) => sum + metric.latest_score, 0);
      const improvementSum = measured.reduce(
        (sum, metric) => sum + (metric.latest_score - metric.first_score),
        0
      );
      const measuredCount = measured.length;

      return {
        category,
        station_label: STATION_CATEGORY_LABELS[category],
        learners_measured: measuredCount,
        total_attempts: totalAttempts,
        completion_rate: toPercent(totalCompletions, totalAttempts),
        average_baseline_score: measuredCount > 0 ? Math.round(baselineSum / measuredCount) : 0,
        average_latest_score: measuredCount > 0 ? Math.round(latestSum / measuredCount) : 0,
        average_improvement_points: measuredCount > 0 ? Math.round(improvementSum / measuredCount) : 0,
      };
    });

    res.json({
      generated_at: new Date().toISOString(),
      source: 'database',
      record_counts: {
        schools: schools.length,
        students: students.length,
        users: users.length,
        sessions: sessions.length,
        student_lessons: studentLessons.length,
        progress: progress.length,
      },
      school_outcomes: schoolOutcomeRows,
      lesson_performance: lessonSummaryRows,
      station_improvements: stationImprovementRows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
