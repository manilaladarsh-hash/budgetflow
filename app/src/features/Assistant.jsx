import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, FileText, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import { callGemini, extractJson, prompts, quickQuestions } from '../lib/gemini.js';
import { sameMonth } from '../lib/dates.js';
import { Card, Button, Sheet, EmptyState, Chip, Spinner, cx } from '../ui/primitives.jsx';
import { MarkdownText, useMoney } from './shared.jsx';

// Chat history lives for the session only (nothing AI-generated is stored).
let sessionHistory = [];

export default function Assistant() {
  const { state, actions, now } = useStore();
  const nav = useNav();
  const { notify } = useFeedback();
  const money = useMoney();
  const [history, setHistory] = useState(sessionHistory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tuneUp, setTuneUp] = useState(null);
  const endRef = useRef(null);
  const { geminiKey: apiKey, aiModel: model, currency } = state.prefs;

  useEffect(() => { sessionHistory = history; endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [history, busy]);

  if (!apiKey) {
    return (
      <Card className="mt-2">
        <EmptyState icon={<Sparkles size={22} />} title="Add a Gemini key to use the assistant" body="It's optional. Budgeting works fully without it." action={<Button size="sm" onClick={() => nav.go('settings')}>Open settings</Button>} />
      </Card>
    );
  }

  const ask = async (question, label) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setHistory((h) => [...h, { role: 'user', text: label || q }]);
    setBusy(true);
    try {
      const reply = await callGemini({ apiKey, model, prompt: prompts.chat(q, state.categories, state.transactions, currency) });
      setHistory((h) => [...h, { role: 'model', text: reply }]);
    } catch (err) {
      setHistory((h) => [...h, { role: 'model', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const reportCard = async () => {
    if (busy) return;
    setHistory((h) => [...h, { role: 'user', text: 'Monthly report card' }]);
    setBusy(true);
    try {
      const monthTx = state.transactions.filter((t) => sameMonth(t.date, now));
      const reply = await callGemini({ apiKey, model, prompt: prompts.reportCard(state.categories, monthTx, currency) });
      setHistory((h) => [...h, { role: 'model', text: reply, card: true }]);
    } catch (err) {
      setHistory((h) => [...h, { role: 'model', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const runTuneUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reply = await callGemini({ apiKey, model, prompt: prompts.tuneUp(state.categories, state.transactions) });
      const proposals = (extractJson(reply) || []).filter((p) => state.categories.some((c) => c.id === String(p.id)) && Number.isFinite(Number(p.newLimit)));
      if (!proposals.length) notify('Your budgets look well sized — no changes suggested', { tone: 'info' });
      else setTuneUp(proposals);
    } catch (err) {
      notify(err.message?.includes('JSON') ? 'Could not read the suggestions — try again' : err.message, { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-2 flex flex-col gap-4">
      <button type="button" onClick={() => nav.go('insights')} className="self-start inline-flex items-center gap-1 text-sm font-medium text-muted h-9"><ArrowLeft size={16} /> Insights</button>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={reportCard} disabled={busy}><FileText size={17} /> Report card</Button>
        <Button variant="secondary" onClick={runTuneUp} disabled={busy}><SlidersHorizontal size={17} /> Tune budgets</Button>
      </div>

      <Card className="p-4 min-h-[45dvh]">
        {history.length === 0 && !busy ? (
          <div>
            <p className="text-[15px] text-muted">Ask anything about your budgets. Try:</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {quickQuestions(currency).map((q) => <Chip key={q} onClick={() => ask(q)}>{q}</Chip>)}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((m, i) => (
              <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx(
                  'max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed',
                  m.role === 'user' ? 'bg-accent text-accent-fg rounded-br-md' : m.error ? 'bg-danger-soft text-danger rounded-bl-md' : 'bg-surface-2 text-muted rounded-bl-md'
                )}>
                  {m.role === 'model' && !m.error ? <MarkdownText text={m.text} /> : m.text}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted px-1"><Spinner size={16} /> Thinking…</div>}
          </div>
        )}
        <div ref={endRef} />
      </Card>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="sticky bottom-24 lg:bottom-4 flex gap-2 p-2 rounded-3xl glass border border-line shadow-card">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your money…" aria-label="Message" className="flex-1 min-w-0 h-11 px-3 bg-transparent outline-none text-ink placeholder:text-subtle" />
        <Button type="submit" disabled={!input.trim() || busy} aria-label="Send" className="w-11 px-0"><Send size={18} /></Button>
      </form>

      <Sheet
        open={!!tuneUp}
        onClose={() => setTuneUp(null)}
        title="Suggested budgets"
        footer={(
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setTuneUp(null)}>Not now</Button>
            <Button onClick={() => { actions.applyTuneUp(tuneUp); setTuneUp(null); notify('Budgets updated'); }}>Apply all</Button>
          </div>
        )}
      >
        <div className="-mx-5 divide-y divide-[var(--border)]">
          {(tuneUp || []).map((p) => {
            const c = state.categories.find((x) => x.id === String(p.id));
            return (
              <div key={p.id} className="px-5 py-3">
                <div className="flex justify-between text-[15px]">
                  <span className="font-medium">{c?.name}</span>
                  <span className="tabular"><span className="text-subtle line-through mr-2">{money(c?.limit)}</span><b className="font-semibold">{money(Number(p.newLimit))}</b></span>
                </div>
                {p.reason && <p className="text-sm text-muted mt-1">{p.reason}</p>}
              </div>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
