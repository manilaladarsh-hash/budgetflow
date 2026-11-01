import { Component } from 'react';
import { createBackup, downloadFile } from '../lib/backup.js';
import { loadState } from '../lib/storage.js';

// Last-resort screen: never leaves the user with a blank page, and always
// offers a way to get their data out.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('BudgetFlow crashed', error, info);
  }

  download = () => {
    try {
      const data = createBackup(loadState());
      downloadFile(`budgetflow-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      alert('Could not create a backup.');
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-bg text-ink">
        <div className="max-w-sm w-full bg-surface border border-line rounded-3xl p-6 shadow-card text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted mt-2">Your data is still saved on this device. You can reload, or download a backup first.</p>
          <div className="grid gap-3 mt-6">
            <button type="button" className="h-11 rounded-2xl bg-accent text-accent-fg font-semibold" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="h-11 rounded-2xl bg-surface-2 border border-line font-semibold" onClick={this.download}>Download backup</button>
          </div>
          <p className="text-xs text-subtle mt-4 break-words">{String(this.state.error?.message || this.state.error)}</p>
        </div>
      </div>
    );
  }
}
