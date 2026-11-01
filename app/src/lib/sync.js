// Optional cloud mirror (Firebase anonymous auth + Firestore), loaded lazily so
// the app renders from local data immediately. Uses the same project and
// document paths as the legacy app, so existing cloud data keeps loading.

export const firebaseConfig = {
  apiKey: 'AIzaSyCY0D823ZoNP8t5A0LSTk2eZrLiQKVr0XI',
  authDomain: 'my-budget-tracker-64883.firebaseapp.com',
  projectId: 'my-budget-tracker-64883',
  storageBucket: 'my-budget-tracker-64883.firebasestorage.app',
  messagingSenderId: '502096393014',
  appId: '1:502096393014:web:69df0d5bdbba7efd2f3997'
};
export const APP_ID = 'budget-tracker-personal';
const MAX_BATCH = 450;

// Remote slice: { categories, transactions, weeksTracked }.
export const startSync = async ({ onRemote, onStatus }) => {
  onStatus('connecting');
  const [{ initializeApp, getApps }, authMod, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore')
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);

  const user = await new Promise((resolve, reject) => {
    const stop = authMod.onAuthStateChanged(auth, (u) => {
      if (u) { stop(); resolve(u); }
    }, reject);
    authMod.signInAnonymously(auth).catch((e) => { stop(); reject(e); });
  });

  const base = fs.doc(db, 'artifacts', APP_ID, 'users', user.uid);
  const catCol = fs.collection(base, 'categories');
  const txCol = fs.collection(base, 'transactions');
  const metaDoc = fs.doc(base, 'meta', 'weeks');

  const latest = { categories: undefined, transactions: undefined, weeksTracked: undefined };
  const emit = () => {
    if (latest.categories === undefined || latest.transactions === undefined || latest.weeksTracked === undefined) return;
    onRemote({ ...latest });
  };
  const fail = () => onStatus('offline');
  const unsubs = [
    fs.onSnapshot(catCol, (s) => { latest.categories = s.docs.map((d) => d.data()); emit(); }, fail),
    fs.onSnapshot(txCol, (s) => { latest.transactions = s.docs.map((d) => d.data()); emit(); }, fail),
    fs.onSnapshot(metaDoc, (s) => { latest.weeksTracked = s.exists() ? Number(s.data().count) || 1 : null; emit(); }, fail)
  ];

  // Write only what changed between two remote slices.
  const write = async (prev, next) => {
    const ops = [];
    const diff = (prevList, nextList, col) => {
      const before = new Map((prevList || []).map((x) => [String(x.id), x]));
      const after = new Map((nextList || []).map((x) => [String(x.id), x]));
      after.forEach((item, id) => {
        const old = before.get(id);
        if (old === item) return;
        if (old && JSON.stringify(old) === JSON.stringify(item)) return;
        ops.push((b) => b.set(fs.doc(col, id), stripUndefined(item)));
      });
      before.forEach((_, id) => {
        if (!after.has(id)) ops.push((b) => b.delete(fs.doc(col, id)));
      });
    };
    diff(prev?.categories, next.categories, catCol);
    diff(prev?.transactions, next.transactions, txCol);
    if (!prev || prev.weeksTracked !== next.weeksTracked) ops.push((b) => b.set(metaDoc, { count: next.weeksTracked }));
    for (let i = 0; i < ops.length; i += MAX_BATCH) {
      const batch = fs.writeBatch(db);
      ops.slice(i, i + MAX_BATCH).forEach((op) => op(batch));
      await batch.commit();
    }
    return ops.length;
  };

  return {
    uid: user.uid,
    write,
    stop: () => unsubs.forEach((u) => u())
  };
};

const stripUndefined = (obj) => JSON.parse(JSON.stringify(obj));
