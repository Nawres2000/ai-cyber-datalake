'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

// Redirects to /login when the visitor is not authenticated. Returns the auth state.
export default function useGuard() {
  const router = useRouter();
  const auth = useAuth();
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/login');
  }, [auth.loading, auth.user, router]);
  return auth;
}
