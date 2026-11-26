import React from "react";

// Top-level safety net: a render crash in one page shows a recovery screen
// instead of a blank white page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI crash:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#FAF7F2", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center", color: "#16302A" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
            This screen hit an error. Reloading usually fixes it. If it keeps happening, tell HR/IT which page you were on.
          </p>
          <button type="button" onClick={() => window.location.reload()}
            style={{ background: "#16302A", color: "#fff", border: 0, padding: "10px 20px", borderRadius: 2, fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 16, wordBreak: "break-word" }}>{String(this.state.error?.message || this.state.error)}</p>
        </div>
      </div>
    );
  }
}
