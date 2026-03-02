import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactElement;
  requiredRole?: string;
  allowTutor?: boolean;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, requiredRole, allowTutor = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Tutors can access all views if allowTutor is true
  if (requiredRole && user.role !== requiredRole) {
    if (allowTutor && user.role === 'tutor') {
      return children;
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
