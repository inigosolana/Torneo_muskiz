import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole: 'staff' | 'manager';
  user: User | null;
  userRole: string | null;
  roleLoading: boolean;
  dataLoaded?: boolean;
  hasApprovedTeam?: boolean;
  onUnauthorizedRole: () => void | Promise<void>;
  unauthenticatedElement: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRole,
  user,
  userRole,
  roleLoading,
  dataLoaded = true,
  hasApprovedTeam = true,
  onUnauthorizedRole,
  unauthenticatedElement
}) => {
  useEffect(() => {
    if (user && !roleLoading && userRole && userRole !== allowedRole) {
      toast.error(`Acceso denegado: Tu cuenta no tiene permisos de ${allowedRole}. Cerrando sesión por seguridad.`);
      void onUnauthorizedRole();
    }
  }, [user, userRole, roleLoading, allowedRole, onUnauthorizedRole]);

  /** Solo bloquear en la carga inicial del rol; no al refrescar token (evita desmontar Admin). */
  if (roleLoading && user && userRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (roleLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (!user) {
    return <>{unauthenticatedElement}</>;
  }

  if (userRole !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole === 'manager') {
    if (!dataLoaded) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
      );
    }

    if (!hasApprovedTeam) {
      return <Navigate to="/registration" replace />;
    }
  }

  return <>{children}</>;
};
