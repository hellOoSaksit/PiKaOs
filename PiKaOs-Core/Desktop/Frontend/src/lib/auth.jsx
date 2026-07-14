// useAuth — the app's single source of truth for "who is logged in".
//
// Wraps the low-level calls in api.js with React state so components just read
// { user, ready, loggedIn } and call { login, logout }. On mount it tries to
// revive a session from the refresh cookie (so a page reload stays logged in).
import React from 'react';
const { useState, useEffect, useCallback } = React;
import * as api from './api.js';

export function useAuth() {
  const [user, setUser] = useState(null);   // backend account from /api/auth/me, or null
  const [ready, setReady] = useState(false); // false until the initial restore() resolves

  useEffect(() => {
    let alive = true;
    api.restore()
      .then((u) => { if (alive && u) setUser(u); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (usernameOrEmail, password) => {
    const u = await api.login(usernameOrEmail, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return { user, ready, loggedIn: !!user, login, logout };
}
