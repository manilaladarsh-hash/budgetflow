import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavContext } from './state/nav.js';
import { House, ListOrdered, Plus, ChartPie, CalendarCheck, Settings as SettingsIcon, Cloud, CloudOff, RefreshCw, Timer } from 'lucide-react';
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
import Import from './features/Import.jsx';
import QuickAddLink from './features/QuickAddLink.jsx';
import Onboarding from './features/Onboarding.jsx';
import AddSheet from './features/AddSheet.jsx';
import TransactionSheet from './features/TransactionSheet.jsx';
import CycleSheet from './features/CycleSheet.jsx';

const ROUTES = ['home', 'activity', 'insights', 'plan', 'settings', 'assistant', 'import'];
const TITLES = { home: null, activity: 'Activity', insights: 'Insights', plan: 'Plan', settings: 'Settings', assistant: 'Assistant', import: 'Import' };
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
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0912' : '#f5f4fa');
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

  const Screen = { home: Home, activity: Activity, insights: Insights, plan: Plan, settings: Settings, assistant: Assistant, import: Import }[route];
  const msLeft = Math.max(0, cycleEndFor(state.cycleStartDate) - now);

  return (
    <NavContext.Provider value={nav}>
      <div className="min-h-dvh lg:pl-64">
        <SideRail route={route} go={nav.go} openAdd={nav.openAdd} />
        <Header route={route} msLeft={msLeft} weeks={state.weeksTracked} nav={nav} name={state.prefs.name} now={now} />
        <main key={route} className="anim-screen mx-auto w-full max-w-[760px] px-4 pt-1 pb-40 lg:pb-16">
          <Screen />
        </main>
        <BottomNav route={route} go={nav.go} openAdd={nav.openAdd} />
      </div>
      <AddSheet state={addSheet} onClose={() => setAddSheet(null)} />
      <TransactionSheet tx={txSheet} onClose={() => setTxSheet(null)} />
      <CycleSheet open={cycleOpen} onClose={() => setCycleOpen(false)} />
      <QuickAddLink />
    </NavContext.Provider>
  );
}

const greeting = (now) => {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function BrandMark({ size = 36 }) {
  return (
    <span className="bg-brand-grad shadow-brand inline-flex items-center justify-center shrink-0 rounded-[12px]" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17c3-6 6 2 9-4s4-6 7-6" />
        <circle cx="20" cy="7" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

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
    <header className="sticky top-0 z-40 glass no-print safe-top lg:bg-transparent lg:backdrop-blur-none">
      <div className="mx-auto max-w-[760px] h-[68px] px-4 flex items-center gap-2.5">
        {title ? (
          <h1 className="flex-1 min-w-0 font-display text-[26px] font-extrabold tracking-tight text-ink truncate">{title}</h1>
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <span className="lg:hidden"><BrandMark /></span>
            <div className="min-w-0">
              <p className="text-[13px] text-muted leading-none truncate">{greeting(now)}{name ? `, ${name}` : ''}</p>
              <p className="font-display text-xl font-extrabold tracking-tight text-ink mt-1 leading-none">BudgetFlow</p>
            </div>
          </div>
        )}
        <SyncDot />
        <button
          type="button"
          onClick={nav.openCycle}
          className="press h-9 px-3 rounded-full bg-surface border border-line shadow-card text-[13px] font-semibold text-ink inline-flex items-center gap-1.5 tabular"
          aria-label={`Cycle ${weeks}, ends in ${formatCountdown(msLeft)}. Open cycle details`}
        >
          <Timer size={15} className="text-brand" aria-hidden="true" />
          {formatCountdown(msLeft)}
        </button>
        <IconButton label="Settings" onClick={() => nav.go('settings')} className={cx('lg:hidden bg-surface border border-line shadow-card', route === 'settings' && 'text-brand')} size={40}>
          <SettingsIcon size={19} />
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
    <nav className="fixed bottom-0 inset-x-0 z-50 no-print lg:hidden px-3 pointer-events-none" aria-label="Main" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <div className="pointer-events-auto mx-auto max-w-[480px] grid grid-cols-5 h-[68px] px-1.5 rounded-[26px] glass border border-line shadow-pop">
        {TABS.map((t) => {
          if (t.id === 'add') {
            return (
              <div key="add" className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => openAdd({ type: 'expense' })}
                  aria-label="Add transaction"
                  className="press w-[58px] h-[58px] -mt-7 rounded-[22px] bg-brand-grad shadow-brand inline-flex items-center justify-center ring-4 ring-[var(--bg)]"
                >
                  <Plus size={28} strokeWidth={2.6} />
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
              className={cx('relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', active ? 'text-brand' : 'text-subtle hover:text-ink')}
            >
              <span className={cx('w-12 h-8 rounded-full inline-flex items-center justify-center transition', active && 'bg-brand-soft')}>
                <t.Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
              </span>
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
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-line bg-surface/70 backdrop-blur-xl px-4 py-6 no-print" aria-label="Main">
      <div className="px-2 mb-8 flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight leading-none">BudgetFlow</p>
          <p className="text-xs text-subtle mt-1">Know where it goes.</p>
        </div>
      </div>
      <button type="button" onClick={() => openAdd({ type: 'expense' })} className="press h-12 mb-5 rounded-full bg-brand-grad shadow-brand font-semibold inline-flex items-center justify-center gap-2">
        <Plus size={19} strokeWidth={2.5} /> New entry
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
              className={cx('h-11 px-3 rounded-2xl inline-flex items-center gap-3 text-[15px] font-semibold transition', active ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-ink hover:bg-surface-2')}
            >
              <t.Icon size={20} /> {t.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
