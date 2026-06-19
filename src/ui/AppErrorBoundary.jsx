import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[LongLAB] Render boundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetView = () => {
    try {
      sessionStorage.removeItem('longlab:activeTab');
    } catch (_) {}
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error?.message ?? String(this.state.error);
    return (
      <main style={{ minHeight: '100vh', background: '#050611', color: '#dbe4ff', padding: 24, fontFamily: 'Space Mono, monospace' }}>
        <section style={{ maxWidth: 920, margin: '8vh auto', border: '1px solid #ff4455', borderRadius: 10, padding: 22, background: '#0b0c1a' }}>
          <div style={{ color: '#ff6677', fontWeight: 900, letterSpacing: 1.5, marginBottom: 12 }}>LONG LAB UI RECOVERY</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            A display value failed to render. Stored trading data remains preserved. Active browser-side simulation may require resuming after recovery, so the underlying render defect is also guarded at source.
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ff9aaa', fontSize: 11, background: '#070812', padding: 12, borderRadius: 6 }}>{message}</pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={this.handleResetView} style={{ padding: '9px 14px', cursor: 'pointer' }}>RESET VIEW</button>
            <button type="button" onClick={this.handleReload} style={{ padding: '9px 14px', cursor: 'pointer' }}>RELOAD APP</button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
