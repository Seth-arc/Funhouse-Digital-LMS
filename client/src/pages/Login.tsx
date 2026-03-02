import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const LEARNER_TOKEN_KEY = 'learner_token';
const LEARNER_PROFILE_KEY = 'learner_profile';

const DEMO_ROLES = [
  {
    role: 'tutor',
    label: 'Tutor / Admin',
    email: 'admin@lms.com',
    password: 'admin123',
    description:
      'Full access: manage schools, teachers, parents, students, games, and lesson plans. View all progress and seed sample data.',
  },
  {
    role: 'teacher',
    label: 'Teacher',
    email: 'teacher@lms.com',
    password: 'teacher123',
    description:
      'View student analytics across your class: game sessions, completion rates, and insights to tailor instruction.',
  },
  {
    role: 'parent',
    label: 'Parent',
    email: 'parent1@lms.com',
    password: 'parent123',
    description:
      'See your child progress: completed games, scores by category, and tips to support learning at home.',
  },
] as const;

const DEMO_LEARNERS = [
  {
    id: 'demo-learner-1',
    label: 'Mpho Sithole (Grade 4)',
    name: 'Mpho Sithole',
    grade: '4',
    pin: '1234',
    description: 'Sample learner account for testing after loading seed data.',
  },
  {
    id: 'demo-learner-2',
    label: 'Sipho Nkosi (Grade 6)',
    name: 'Sipho Nkosi',
    grade: '6',
    pin: '1234',
    description: 'Use this account to verify learner dashboard and progress flow.',
  },
  {
    id: 'demo-learner-3',
    label: 'Amahle Molefe (Grade 9)',
    name: 'Amahle Molefe',
    grade: '9',
    pin: '1234',
    description: 'Higher-grade sample learner for testing schedule and notes views.',
  },
] as const;

const isEmailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isNameValid = (value: string) => /^[A-Za-z][A-Za-z\s'-]*$/.test(value);
const isLearnerPinValid = (value: string) => /^\d{4,8}$/.test(value);

const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'staff' | 'student'>(
    searchParams.get('student') === '1' ? 'student' : 'staff'
  );
  const { login } = useAuth();
  const navigate = useNavigate();

  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffTouched, setStaffTouched] = useState({ email: false, password: false });
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');

  const [studentName, setStudentName] = useState('');
  const [studentGrade, setStudentGrade] = useState('');
  const [studentPin, setStudentPin] = useState('');
  const [studentTouched, setStudentTouched] = useState({ name: false, pin: false });
  const [studentSigningIn, setStudentSigningIn] = useState(false);
  const [studentError, setStudentError] = useState('');

  const normalizedStudentName = useMemo(
    () => studentName.trim().replace(/\s+/g, ' '),
    [studentName]
  );
  const normalizedStudentPin = useMemo(() => studentPin.trim(), [studentPin]);

  const staffEmailError = useMemo(() => {
    if (!staffEmail.trim()) return 'Email is required.';
    if (!isEmailValid(staffEmail.trim())) return 'Enter a valid email address.';
    return '';
  }, [staffEmail]);

  const staffPasswordError = useMemo(() => {
    if (!staffPassword) return 'Password is required.';
    if (staffPassword.length < 6) return 'Use at least 6 characters.';
    return '';
  }, [staffPassword]);

  const studentNameError = useMemo(() => {
    if (!normalizedStudentName) return 'Name is required.';
    if (normalizedStudentName.length < 2) return 'Use at least 2 characters.';
    if (!isNameValid(normalizedStudentName)) return 'Use letters, spaces, apostrophes, or hyphens only.';
    return '';
  }, [normalizedStudentName]);

  const studentPinError = useMemo(() => {
    if (!normalizedStudentPin) return 'PIN is required.';
    if (!/^\d{4,8}$/.test(normalizedStudentPin)) return 'PIN must be 4-8 digits.';
    return '';
  }, [normalizedStudentPin]);

  const routeByRole = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role === 'tutor') navigate('/tutor');
    else if (user.role === 'teacher') navigate('/teacher');
    else if (user.role === 'parent') navigate('/parent');
    else navigate('/login');
  };

  const fillAndSubmit = (demoEmail: string, demoPassword: string) => {
    setStaffError('');
    setStaffLoading(true);
    setStaffEmail(demoEmail);
    setStaffPassword(demoPassword);
    login(demoEmail, demoPassword)
      .then(routeByRole)
      .catch((err: any) => setStaffError(err.message || 'Login failed'))
      .finally(() => setStaffLoading(false));
  };

  const handleStaffSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStaffTouched({ email: true, password: true });
    if (staffEmailError || staffPasswordError) return;

    setStaffLoading(true);
    setStaffError('');
    try {
      await login(staffEmail.trim(), staffPassword);
      routeByRole();
    } catch (err: any) {
      setStaffError(err.message || 'Login failed');
    } finally {
      setStaffLoading(false);
    }
  };

  const submitLearnerLogin = async (name: string, pin: string, grade?: string) => {
    const payload: Record<string, string | number> = {
      name: name.trim().replace(/\s+/g, ' '),
      learner_pin: pin.trim(),
    };
    const normalizedGrade = typeof grade === 'string' ? grade.trim() : '';
    if (normalizedGrade) payload.grade = parseInt(normalizedGrade, 10);

    const res = await axios.post(`${API_URL}/auth/learner-login`, payload);
    const { token, learner } = res.data || {};
    if (!token || !learner?.id) {
      throw new Error('Could not sign in. Please try again.');
    }

    localStorage.setItem(LEARNER_TOKEN_KEY, token);
    localStorage.setItem(LEARNER_PROFILE_KEY, JSON.stringify(learner));
    navigate(`/learner/${learner.id}`);
  };

  const fillAndSubmitLearner = async (learner: (typeof DEMO_LEARNERS)[number]) => {
    setStudentError('');
    setStudentTouched({ name: true, pin: true });
    setStudentName(learner.name);
    setStudentGrade(learner.grade);
    setStudentPin(learner.pin);
    setStudentSigningIn(true);
    try {
      if (!isNameValid(learner.name) || !isLearnerPinValid(learner.pin)) {
        setStudentError('Invalid learner demo credentials configured.');
        return;
      }
      await submitLearnerLogin(learner.name, learner.pin, learner.grade);
    } catch (err: any) {
      setStudentError(err.response?.data?.error || err.message || 'Invalid sign-in details. Check name, grade, and PIN.');
    } finally {
      setStudentSigningIn(false);
    }
  };

  const handleStudentSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStudentTouched({ name: true, pin: true });
    if (studentNameError || studentPinError) return;

    setStudentSigningIn(true);
    setStudentError('');

    try {
      await submitLearnerLogin(normalizedStudentName, normalizedStudentPin, studentGrade);
    } catch (err: any) {
      setStudentError(err.response?.data?.error || err.message || 'Invalid sign-in details. Check name, grade, and PIN.');
    } finally {
      setStudentSigningIn(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-wordmark">
          <span className="login-wordmark__main">Funhouse</span>
          <span className="login-wordmark__accent">Digital</span>
        </h1>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab${activeTab === 'staff' ? ' login-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('staff');
              setStaffError('');
            }}
          >
            Staff Sign In
          </button>
          <button
            type="button"
            className={`login-tab${activeTab === 'student' ? ' login-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('student');
              setStudentError('');
            }}
          >
            I am a Learner
          </button>
        </div>

        <div
          className="auth-state-strip"
          aria-live="polite"
          hidden
          aria-hidden="true"
        >
          {activeTab === 'staff' ? (
            <>
              <span className="auth-state-pill auth-state-pill--invite">Invite setup</span>
              <span className="auth-state-pill auth-state-pill--reset">Password reset</span>
              <p className="auth-state-note">
                Staff accounts are invite-based. Password reset tokens are available through the API flow.
              </p>
            </>
          ) : (
            <>
              <span className="auth-state-pill auth-state-pill--pin">Learner PIN sign-in</span>
              <p className="auth-state-note">
                Learners sign in with a tutor-issued PIN and can use grade to narrow duplicate names.
              </p>
            </>
          )}
        </div>

        {activeTab === 'staff' && (
          <div className="demo-section">
            {staffError && (
              <div className="error-message" role="alert" style={{ marginBottom: 'var(--spacing-md)' }}>
                {staffError}
              </div>
            )}
            <p className="demo-section-title">Select your role</p>
            <p className="demo-section-hint">
              Click your role to sign in instantly. Use "Load Sample Data" on Tutor first if you see empty lists.
            </p>
            <div className="demo-roles">
              {DEMO_ROLES.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  className="demo-role-card"
                  onClick={() => fillAndSubmit(demo.email, demo.password)}
                  disabled={staffLoading}
                >
                  <span className="demo-role-label">{demo.label}</span>
                  <span className="demo-role-desc">{demo.description}</span>
                </button>
              ))}
            </div>

            <form className="manual-login" onSubmit={handleStaffSubmit} noValidate>
              <p className="manual-login-title">Sign in with email and password</p>
              <div className="form-group">
                <label htmlFor="staff-email">Email</label>
                <input
                  id="staff-email"
                  type="email"
                  autoComplete="username"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  onBlur={() => setStaffTouched((prev) => ({ ...prev, email: true }))}
                  className={staffTouched.email && staffEmailError ? 'input-invalid' : ''}
                  aria-invalid={staffTouched.email && !!staffEmailError}
                  aria-describedby="staff-email-help"
                  placeholder="you@school.org"
                />
                {staffTouched.email && staffEmailError ? (
                  <p id="staff-email-help" className="field-error" role="status">
                    {staffEmailError}
                  </p>
                ) : (
                  <p id="staff-email-help" className="field-help">
                    Use the same email used when the account was created.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="staff-password">Password</label>
                <input
                  id="staff-password"
                  type="password"
                  autoComplete="current-password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  onBlur={() => setStaffTouched((prev) => ({ ...prev, password: true }))}
                  className={staffTouched.password && staffPasswordError ? 'input-invalid' : ''}
                  aria-invalid={staffTouched.password && !!staffPasswordError}
                  aria-describedby="staff-password-help"
                  placeholder="Enter your password"
                />
                {staffTouched.password && staffPasswordError ? (
                  <p id="staff-password-help" className="field-error" role="status">
                    {staffPasswordError}
                  </p>
                ) : (
                  <p id="staff-password-help" className="field-help">
                    Password is case-sensitive.
                  </p>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={staffLoading}>
                {staffLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'student' && (
          <div className="student-lookup">
            <div className="demo-section learner-demo-section">
              <p className="demo-section-title">Testing learner sign in</p>
              <p className="demo-section-hint">
                Click a learner to sign in instantly. If it fails, run &quot;Load Sample Data&quot; on Tutor first.
              </p>
              <div className="demo-roles">
                {DEMO_LEARNERS.map((learner) => (
                  <button
                    key={learner.id}
                    type="button"
                    className="demo-role-card"
                    onClick={() => {
                      void fillAndSubmitLearner(learner);
                    }}
                    disabled={studentSigningIn}
                  >
                    <span className="demo-role-label">{learner.label}</span>
                    <span className="demo-role-desc">{learner.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="student-lookup-hint" hidden aria-hidden="true">
              Enter your name and learner PIN. Ask your tutor if you need help with your PIN.
            </p>
            <form onSubmit={handleStudentSignIn} noValidate hidden aria-hidden="true">
              <div className="form-group">
                <label htmlFor="student-name">Your name</label>
                <input
                  id="student-name"
                  type="text"
                  placeholder="Example: Alex or Alex Smith"
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setStudentError('');
                  }}
                  onBlur={() => setStudentTouched((prev) => ({ ...prev, name: true }))}
                  autoComplete="name"
                  className={studentTouched.name && studentNameError ? 'input-invalid' : ''}
                  aria-invalid={studentTouched.name && !!studentNameError}
                  aria-describedby="student-name-help"
                  required
                />
                {studentTouched.name && studentNameError ? (
                  <p id="student-name-help" className="field-error" role="status">
                    {studentNameError}
                  </p>
                ) : (
                  <p id="student-name-help" className="field-help">
                    Use the exact name your tutor entered.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="student-grade">
                  Grade <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  id="student-grade"
                  value={studentGrade}
                  onChange={(e) => {
                    setStudentGrade(e.target.value);
                    setStudentError('');
                  }}
                >
                  <option value="">Any grade</option>
                  {[4, 5, 6, 7, 8, 9].map((g) => (
                    <option key={g} value={String(g)}>
                      Grade {g}
                    </option>
                  ))}
                </select>
                <p className="field-help">Optional, but helpful if another learner has the same name.</p>
              </div>

              <div className="form-group">
                <label htmlFor="student-pin">Learner PIN</label>
                <input
                  id="student-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="4-8 digit PIN"
                  value={studentPin}
                  onChange={(e) => {
                    setStudentPin(e.target.value);
                    setStudentError('');
                  }}
                  onBlur={() => setStudentTouched((prev) => ({ ...prev, pin: true }))}
                  className={`input-pin${studentTouched.pin && studentPinError ? ' input-invalid' : ''}`}
                  aria-invalid={studentTouched.pin && !!studentPinError}
                  aria-describedby="student-pin-help"
                />
                {studentTouched.pin && studentPinError ? (
                  <p id="student-pin-help" className="field-error" role="status">
                    {studentPinError}
                  </p>
                ) : (
                  <p id="student-pin-help" className="field-help">
                    This PIN is set by your tutor.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={studentSigningIn || !!studentNameError || !!studentPinError}
              >
                {studentSigningIn ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {studentError && (
              <div className="error-message" role="alert" style={{ marginTop: 'var(--spacing-md)' }}>
                {studentError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
