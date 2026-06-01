import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

export type AppRole = 'staff' | 'manager' | 'referee_coordinator';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: AppRole;
  /** Si se indica, permite cualquiera de estos roles (prioridad sobre allowedRole). */
  allowedRoles?: AppRole[];
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
  allowedRoles,
  user,
  userRole,
  roleLoading,
  dataLoaded = true,
  hasApprovedTeam = true,
  onUnauthorizedRole,
  unauthenticatedElement
}) => {
  const permitted = allowedRoles ?? (allowedRole ? [allowedRole] : []);

  useEffect(() => {
    if (user && !roleLoading && userRole && permitted.length > 0 && !permitted.includes(userRole as AppRole)) {
      toast.error(`Acceso denegado: tu cuenta no tiene permisos para esta sección. Cerrando sesión.`);
      void onUnauthorizedRole();
    }
  }, [user, userRole, roleLoading, permitted, onUnauthorizedRole]);

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

  if (permitted.length > 0 && !permitted.includes(userRole as AppRole)) {
    return <Navigate to="/" replace />;
  }

  if (permitted.includes('manager') && userRole === 'manager') {
    if (!dataLoaded) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        </div>
      );
    }
    /* Sin equipo aprobado: se muestra el panel vacío (no redirigir a inscripción). */
  }

  return <>{children}</>;
};
