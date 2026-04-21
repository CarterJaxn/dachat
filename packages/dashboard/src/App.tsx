import React, { useState } from "react";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";

const STORAGE_KEY = "dachat_operator_token";

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const handleLogin = (t: string) => {
    localStorage.setItem(STORAGE_KEY, t);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
