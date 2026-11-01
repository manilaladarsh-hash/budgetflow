// A realistic legacy (v3) localStorage dataset, as the old single-file app
// wrote it. Used to prove the new version loads existing data unchanged.
export const legacyStorage = (now = new Date()) => {
  const day = (offset, h = 12) => { const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(h, 15, 0, 0); return d.toISOString(); };
  const sunday = new Date(now); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay());
  const categories = [
    { id: '1', name: 'Grocery', limit: 70, balance: 31.5, icon: 'apple', frequency: 'weekly', color: 'text-neon-green', pinned: false },
    { id: '2', name: 'Shopping', limit: 65, balance: 65, icon: 'shopping-bag', frequency: 'weekly', color: 'text-neon-blue', pinned: false },
    { id: '3', name: 'Rent', limit: 700, balance: 0, icon: 'home', frequency: 'monthly', color: 'text-neon-purple', pinned: false },
    { id: '4', name: 'Phone', limit: 65, balance: 65, icon: 'smartphone', frequency: 'monthly', color: 'text-neon-red', pinned: true },
    { id: '1729000000000', name: 'Coffee', limit: 20, balance: -4, icon: 'coffee', frequency: 'weekly', color: 'text-white', pinned: false }
  ];
  const transactions = [
    { id: '1730000000001', date: day(0, 9), amount: 24, description: 'Coffee beans', categoryId: '1729000000000', categoryName: 'Coffee', type: 'expense', recurring: 'none', tags: ['food'] },
    { id: '1730000000002', date: day(-1, 18), amount: 38.5, description: 'Groceries', categoryId: '1', categoryName: 'Grocery', type: 'expense', recurring: 'none', tags: [] },
    { id: '1730000000003', date: day(-2), amount: 700, description: 'Rent', categoryId: '3', categoryName: 'Rent', type: 'expense', recurring: 'monthly' },
    { id: '1730000000004', date: day(-3), amount: 0, description: 'Transfer: Shopping -> Grocery', categoryId: 'system', categoryName: 'Transfer', type: 'transfer', recurring: 'none' },
    { id: '1730000000005', date: day(-4), amount: 1200, description: 'Paycheque', categoryId: '2', categoryName: 'Shopping', type: 'income', recurring: 'none' },
    { id: '1730000000006', date: day(-7), amount: 0, description: '🔄 Auto-Cycle 6 started', categoryId: 'system', categoryName: 'System', type: 'system' },
    { id: '1730000000007', date: day(-9), amount: 52, description: 'Dinner out', categoryId: '2', categoryName: 'Shopping', type: 'expense', recurring: 'none', tags: ['fun'] },
    { id: '1730000000008', date: day(-20), amount: 61, description: 'Costco', categoryId: '1', categoryName: 'Grocery', type: 'expense' },
    { id: '1730000000009', date: day(-35), amount: 44, description: 'Shoes', categoryId: '2', categoryName: 'Shopping', type: 'expense' }
  ];
  return {
    cats_v33: JSON.stringify(categories),
    tx_v33: JSON.stringify(transactions),
    meta_v33: '6',
    cycle_start_v2: sunday.toISOString(),
    cycle_history_v2: JSON.stringify([{ cycle: 5, startDate: day(-14), endDate: day(-7), totalSpent: 140 }]),
    savings_goals_v2: JSON.stringify([{ id: 'g1', name: 'Japan trip', target: 2000, saved: 450, icon: 'plane', color: '#00f0ff', deposits: [] }]),
    subscriptions_v2: JSON.stringify([{ id: 's1', name: 'Netflix', amount: 16.49, frequency: 'monthly', icon: 'credit-card', nextDue: day(2).slice(0, 10), active: true, categoryId: '2' }]),
    bills_v2: JSON.stringify([{ id: 'b1', name: 'Hydro', amount: 85, dueDay: Math.min(28, now.getDate() + 2), icon: 'file-text', categoryId: '', paid: false, lastPaidMonth: null }]),
    net_worth_v2: JSON.stringify([{ id: 'n1', name: 'Savings', amount: 5400, type: 'asset', icon: 'landmark' }, { id: 'n2', name: 'Student loan', amount: 12000, type: 'liability', icon: 'landmark' }]),
    wishlist_v2: JSON.stringify([{ id: 'w1', name: 'Headphones', price: 120, priority: 'high', url: '', purchased: false }]),
    tags_v2: JSON.stringify(['food', 'transport', 'fun', 'bills', 'health']),
    streak_v2: '3',
    achievements_v2: JSON.stringify(['7day']),
    onboarding_done_v2: 'true',
    user_name: 'Adarsh',
    currency: '$',
    daily_spend_limit: '0',
    tx_alert_threshold: '0'
  };
};
