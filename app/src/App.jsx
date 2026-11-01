import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavContext } from './state/nav.js';
import { House, ListOrdered, Plus, ChartPie, CalendarCheck, Settings as SettingsIcon, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { StoreProvider, useStore } from './state/store.jsx';
import { FeedbackProvider, useFeedback } from './ui/feedback.jsx';
import { IconButton, cx } from './ui/primitives.jsx';
import { formatCountdown } from './lib/dates.js';
import { cycleEndFor } from './lib/cycle.js';
import Home from './features/Home.jsx';
import Activity from './features/Activity.jsx';
import Insights from './features/Insights.jsx';
import Plan from './features/Plan.jsx';
import Settings from './features/Settings.jsx';
import Assistant from './features/Assistant.jsx';
import Onboarding from './features/Onboarding.jsx';
import AddSheet from './features/AddSheet.jsx';
import TransactionSheet from './features/TransactionSheet.jsx';
import CycleSheet from './features/CycleSheet.jsx';

const ROUTES = ['home', 'activity', 'insights', 'plan', 'settings', 'assistant'];
const TITLES = { home: null, activity: 'Activity', insights: 'Insights', plan: 'Plan', settings: 'Settings', assistant: 'Assistant' };
const routeFromHash = () => {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(r) ? r : 'home';
};

export default function App() {
  return (
    <FeedbackProvider>
      <StoreBridge />
    </FeedbackProvider>
  );
}

// Store events (cycle renewal, achievements) surface as toasts.
function StoreBridge() {
  const { notify } = useFeedback();
  const onEvent = useCallback((type, payload) => {
    if (type === 'cycle') notify(payload.renewed > 1 ? `Caught up ${payload.renewed} cycles — now on cycle ${payload.weeks}` : `New cycle ${payload.weeks} started`, { tone: 'info' });
    if (type === 'achievement') notify(payload === '30day' ? 'Achievement: 30-day under-budget streak' : 'Achievement: 7-day under-budget streak');
  }, [notify]);
  return (
    <StoreProvider onEvent={onEvent}>
      <Shell />
    </StoreProvider>
  );
}

function useThemeSync(pref) {
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq?.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d10' : '#f4f5f7');
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [pref]);
}

function Shell() {
  const { state, now } = useStore();
  const [route, setRoute] = useState(routeFromHash);
  const [addSheet, setAddSheet] = useState(null);
  const [txSheet, setTxSheet] = useState(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  useThemeSync(state.prefs.theme);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route]);

  const nav = useMemo(() => ({
    route,
    go: (r) => { if (window.location.hash !== `#/${r}`) window.location.hash = `/${r}`; else setRoute(r); },
    openAdd: (opts = {}) => setAddSheet({ key: Date.now(), ...opts }),
    openTransaction: (tx) => setTxSheet(tx),
    openCycle: () => setCycleOpen(true)
  }), [route]);

  if (!state.prefs.onboarded) {
    return <Onboarding />;
  }

  const Screen = { home: Home, activity: Activity, insights: Insights, plan: Plan, settings: Settings, assistant: Assistant }[route];
  const msLeft = Math.max(0, cycleEndFor(state.cycleStartDate) - now);

  return (
    <NavContext.Provider value={nav}>
      <div className="min-h-dvh lg:pl-64">
        <SideRail route={route} go={nav.go} openAdd={nav.openAdd} />
        <Header route={route} msLeft={msLeft} weeks={state.weeksTracked} nav={nav} name={state.prefs.name} now={now} />
        <main key={route} className="anim-screen mx-auto w-full max-w-[720px] px-4 pt-2 pb-36 lg:pb-16">
          <Screen />
        </main>
        <BottomNav route={route} go={nav.go} openAdd={nav.openAdd} />
      </div>
      <AddSheet state={addSheet} onClose={() => setAddSheet(null)} />
      <TransactionSheet tx={txSheet} onClose={() => setTxSheet(null)} />
      <CycleSheet open={cycleOpen} onClose={() => setCycleOpen(false)} />
    </NavContext.Provider>
  );
}

const greeting = (now) => {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function SyncDot() {
  const { syncStatus } = useStore();
  const map = {
    synced: { icon: <Cloud size={18} />, label: 'Synced to cloud backup', cls: 'text-accent' },
    connecting: { icon: <RefreshCw size={16} className="anim-spin" />, label: 'Connecting to cloud', cls: 'text-subtle' },
    offline: { icon: <CloudOff size={18} />, label: 'Offline — saved on this device', cls: 'text-subtle' },
    error: { icon: <CloudOff size={18} />, label: 'Cloud sync error — saved on this device', cls: 'text-warn' },
    off: null
  };
  const s = map[syncStatus];
  if (!s) return null;
  return <span className={cx('w-9 h-9 inline-flex items-center justify-center', s.cls)} title={s.label} aria-label={s.label} role="img">{s.icon}</span>;
}

function Header({ route, msLeft, weeks, nav, name, now }) {
  const title = TITLES[route];
  return (
    <header className="sticky top-0 z-40 glass border-b border-line no-print safe-top">
      <div className="mx-auto max-w-[720px] h-16 px-4 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          {title ? (
            <h1 className="text-xl font-semibold tracking-tight text-ink truncate">{title}</h1>
          ) : (
            <div className="min-w-0">
              <p className="text-[13px] text-muted leading-none">{greeting(now)}{name ? `, ${name}` : ''}</p>
              <h1 className="text-xl font-semibold tracking-tight text-ink mt-1 leading-none">BudgetFlow</h1>
            </div>
          )}
        </div>
        <SyncDot />
        <button
          type="button"
          onClick={nav.openCycle}
          className="h-9 px-3 rounded-full bg-surface-2 border border-line text-[13px] font-semibold text-muted hover:text-ink inline-flex items-center gap-1.5 tabular"
          aria-label={`Cycle ${weeks}, ends in ${formatCountdown(msLeft)}. Open cycle details`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
          {formatCountdown(msLeft)}
        </button>
        <IconButton label="Settings" onClick={() => nav.go('settings')} className={cx('lg:hidden', route === 'settings' && 'text-ink bg-surface-2')}>
          <SettingsIcon size={20} />
        </IconButton>
      </div>
    </header>
  );
}

const TABS = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'activity', label: 'Activity', Icon: ListOrdered },
  { id: 'add' },
  { id: 'insights', label: 'Insights', Icon: ChartPie },
  { id: 'plan', label: 'Plan', Icon: CalendarCheck }
];

function BottomNav({ route, go, openAdd }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 glass border-t border-line no-print lg:hidden" aria-label="Main">
      <div className="mx-auto max-w-[720px] grid grid-cols-5 h-[68px] px-2 safe-bottom box-content">
        {TABS.map((t) => {
          if (t.id === 'add') {
            return (
              <div key="add" className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => openAdd({ type: 'expense' })}
                  aria-label="Add transaction"
                  className="w-14 h-14 rounded-full bg-accent text-accent-fg shadow-pop inline-flex items-center justify-center active:scale-95 transition"
                >
                  <Plus size={26} strokeWidth={2.4} />
                </button>
              </div>
            );
          }
          const active = route === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={active ? 'page' : undefined}
              className={cx('flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition', active ? 'text-accent-strong' : 'text-subtle hover:text-ink')}
            >
              <t.Icon size={22} strokeWidth={active ? 2.3 : 1.9} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SideRail({ route, go, openAdd }) {
  const items = [...TABS.filter((t) => t.id !== 'add'), { id: 'settings', label: 'Settings', Icon: SettingsIcon }];
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-line bg-surface px-4 py-6 no-print" aria-label="Main">
      <div className="px-3 mb-8">
        <p className="text-lg font-semibold tracking-tight">BudgetFlow</p>
        <p className="text-xs text-subtle">Weekly budgets, calmly.</p>
      </div>
      <button type="button" onClick={() => openAdd({ type: 'expense' })} className="h-11 mb-4 rounded-2xl bg-accent text-accent-fg font-semibold inline-flex items-center justify-center gap-2">
        <Plus size={18} /> New entry
      </button>
      <nav className="flex flex-col gap-1">
        {items.map((t) => {
          const active = route === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={active ? 'page' : undefined}
              className={cx('h-11 px-3 rounded-xl inline-flex items-center gap-3 text-[15px] font-medium transition', active ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:text-ink hover:bg-surface-2')}
            >
              <t.Icon size={20} /> {t.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
