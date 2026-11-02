import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import { parseQuickAdd, planQuickAdd } from '../lib/quickadd.js';
import { useMoney } from './shared.jsx';

// Handles links like  #/add?amount=6.45&merchant=Starbucks&card=Amex&auto=1
// (sent by an iPhone Shortcuts "Transaction" automation after Apple Pay).
export default function QuickAddLink() {
  const { state, actions } = useStore();
  const nav = useNav();
  const { notify } = useFeedback();
  const money = useMoney();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const handle = () => {
      const hash = window.location.hash;
      if (!/^#\/?add(\?|$)/.test(hash)) return;
      const request = parseQuickAdd(hash.split('?')[1] || '');
      // Swap the link for Home so a refresh doesn't add it twice.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/home`);
      nav.go('home');
      if (!request) {
        nav.openAdd({ type: 'expense' });
        return;
      }
      const plan = planQuickAdd(request, stateRef.current);
      if (plan.action === 'duplicate') {
        notify(`Already logged ${money(request.amount)} at ${request.merchant || 'that merchant'}`, { tone: 'info' });
        return;
      }
      if (plan.action === 'add') {
        actions.addTransactions([plan.transaction]);
        const tx = plan.transaction;
        notify(`${money(tx.amount)} at ${tx.description} → ${tx.categoryName}`, {
          actionLabel: 'Change',
          onAction: () => nav.openTransaction(tx),
          duration: 7000
        });
        return;
      }
      if (plan.action === 'skipped') {
        notify(`Not logged: your rule skips ${request.merchant}`, { tone: 'info', actionLabel: 'Log it', onAction: () => nav.openAdd(plan.addOptions) });
        return;
      }
      nav.openAdd(plan.addOptions);
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
