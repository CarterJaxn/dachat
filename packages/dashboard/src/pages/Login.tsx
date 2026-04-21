import React, { useState, FormEvent } from "react";
import { login } from "../api.js";

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await login(email, password);
      onLogin(token);
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>DaChat</h1>
        <p style={styles.subtitle}>Operator Dashboard</p>
        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            autoFocus
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "40px 36px",
    width: 360,
    boxShadow: "0 4px 24px rgba(0,0,0,.08)",
    border: "1px solid #e5e7eb",
  },
  title: { fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 28 },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  label: { fontSize: 13, fontWeight: 500, color: "#374151" },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 14,
    outline: "none",
    marginBottom: 6,
  },
  error: { fontSize: 13, color: "#ef4444", marginTop: -4 },
  button: {
    marginTop: 8,
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
