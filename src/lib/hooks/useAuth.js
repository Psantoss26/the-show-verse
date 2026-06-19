"use client";

import { useAuth as useAuthContext } from "@/context/AuthContext";

export default function useAuth() {
  const auth = useAuthContext();
  return {
    account: auth.account,
    sessionId: auth.session,
    checking: !auth.hydrated,
    authenticated: auth.authenticated,
    user: auth.user,
    login: auth.login,
    register: auth.register,
    logout: auth.logout,
    refreshMe: auth.refreshMe,
  };
}
