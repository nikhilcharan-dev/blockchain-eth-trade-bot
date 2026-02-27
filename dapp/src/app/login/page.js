"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import "./login.css";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // "login" or "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const formRef = useRef(null);
  const titleRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const tl = gsap.timeline();

    tl.from(titleRef.current, {
      y: -40,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
    }).from(
      cardRef.current,
      {
        y: 60,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
      },
      "-=0.3"
    );
  }, []);

  const animateOut = (destination) => {
    gsap.to(cardRef.current, {
      scale: 0.95,
      opacity: 0,
      y: -20,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => router.push(destination),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (mode === "register") {
      if (username.trim().length < 3) {
        setError("Username must be at least 3 characters");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      // Save username to localStorage for UI display
      localStorage.setItem(
        "id",
        JSON.stringify({ username: data.user.username, ts: Date.now() })
      );

      animateOut("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest: true }),
      });

      if (resp.ok) {
        localStorage.setItem(
          "id",
          JSON.stringify({ username: "Guest", ts: Date.now() })
        );
      }

      animateOut("/dashboard");
    } catch {
      animateOut("/dashboard");
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setConfirmPassword("");
  };

  return (
    <section className="login-page">
      <div className="login-bg-gradient" />

      <h1 ref={titleRef} className="login-title">
        Crypto Dashboard
      </h1>

      <div ref={cardRef} className="login-card">
        {/* Mode tabs */}
        <div className="login-tabs">
          <button
            className={`login-tab ${mode === "login" ? "login-tab-active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign In
          </button>
          <button
            className={`login-tab ${mode === "register" ? "login-tab-active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>

        <p className="login-subtitle">
          {mode === "login"
            ? "Access your personalized trading dashboard"
            : "Create a new account to get started"}
        </p>

        <form ref={formRef} onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "register" && (
            <div className="login-field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-btn login-btn-primary"
            disabled={loading}
          >
            {loading
              ? mode === "register"
                ? "Creating account..."
                : "Signing in..."
              : mode === "register"
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="login-btn login-btn-guest"
          onClick={handleGuestAccess}
        >
          Continue as Guest
        </button>

        <p className="login-footer-text">
          Real-time data powered by WazirX API
        </p>
      </div>
    </section>
  );
}
