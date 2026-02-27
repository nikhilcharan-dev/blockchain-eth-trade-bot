"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import "./login.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);

    // Simulate authentication delay
    setTimeout(() => {
      localStorage.setItem("id", JSON.stringify({ username, ts: Date.now() }));

      // Animate out then navigate
      gsap.to(cardRef.current, {
        scale: 0.95,
        opacity: 0,
        y: -20,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => router.push("/dashboard"),
      });
    }, 800);
  };

  const handleGuestAccess = () => {
    gsap.to(cardRef.current, {
      scale: 0.95,
      opacity: 0,
      y: -20,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => router.push("/dashboard"),
    });
  };

  return (
    <section className="login-page">
      <div className="login-bg-gradient" />

      <h1 ref={titleRef} className="login-title">
        Crypto Dashboard
      </h1>

      <div ref={cardRef} className="login-card">
        <h2 className="login-card-title">Sign In</h2>
        <p className="login-subtitle">
          Access your personalized trading dashboard
        </p>

        <form ref={formRef} onSubmit={handleLogin} className="login-form">
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
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-btn login-btn-primary"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
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
          Real-time data powered by Binance WebSocket API
        </p>
      </div>
    </section>
  );
}
