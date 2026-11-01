// Icons are imported individually so they render with the first paint (the
// legacy app injected them after render, which made them "jump").
import {
  Apple, ShoppingBag, House, Smartphone, Coffee, Car, Dumbbell, Heart, Gift, Plane, Book, Briefcase, Gamepad2,
  PawPrint, GraduationCap, Utensils, Zap, Droplet, CreditCard, Landmark, FileText, Target, Wallet, Circle, Bus,
  Fuel, Film, Music, Shirt, Baby, Stethoscope, Pill, Wifi, Lightbulb, Hammer, Train, Bike, PiggyBank, Receipt,
  Popcorn, Sprout, Cat, Dog, Gem, Wrench, Plug, Banknote, Building2, Star, Umbrella, Scissors, Tv
} from 'lucide-react';

export const ICONS = {
  apple: Apple,
  'shopping-bag': ShoppingBag,
  home: House,
  smartphone: Smartphone,
  coffee: Coffee,
  car: Car,
  dumbbell: Dumbbell,
  heart: Heart,
  gift: Gift,
  plane: Plane,
  book: Book,
  briefcase: Briefcase,
  'gamepad-2': Gamepad2,
  'paw-print': PawPrint,
  'graduation-cap': GraduationCap,
  utensils: Utensils,
  zap: Zap,
  droplet: Droplet,
  'credit-card': CreditCard,
  landmark: Landmark,
  'file-text': FileText,
  target: Target,
  wallet: Wallet,
  bus: Bus,
  fuel: Fuel,
  film: Film,
  music: Music,
  shirt: Shirt,
  baby: Baby,
  stethoscope: Stethoscope,
  pill: Pill,
  wifi: Wifi,
  lightbulb: Lightbulb,
  hammer: Hammer,
  train: Train,
  bike: Bike,
  'piggy-bank': PiggyBank,
  receipt: Receipt,
  popcorn: Popcorn,
  sprout: Sprout,
  cat: Cat,
  dog: Dog,
  gem: Gem,
  wrench: Wrench,
  plug: Plug,
  banknote: Banknote,
  building: Building2,
  star: Star,
  umbrella: Umbrella,
  scissors: Scissors,
  tv: Tv,
  circle: Circle
};

export const CATEGORY_ICON_CHOICES = [
  'apple', 'utensils', 'coffee', 'shopping-bag', 'shirt', 'home', 'zap', 'droplet', 'wifi', 'smartphone', 'car', 'fuel',
  'bus', 'train', 'bike', 'plane', 'heart', 'stethoscope', 'pill', 'dumbbell', 'gamepad-2', 'film', 'music', 'tv',
  'popcorn', 'book', 'graduation-cap', 'briefcase', 'gift', 'paw-print', 'baby', 'scissors', 'wrench', 'credit-card',
  'piggy-bank', 'landmark'
];

export const GOAL_ICON_CHOICES = ['target', 'plane', 'home', 'car', 'gift', 'graduation-cap', 'heart', 'piggy-bank', 'gem', 'umbrella', 'smartphone', 'star'];

export function CatIcon({ name, size = 20, strokeWidth = 2, className }) {
  const Cmp = ICONS[name] || Circle;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}

// Category tint. Legacy categories stored Tailwind class names such as
// "text-neon-green"; new ones store a palette key.
export const PALETTE = {
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  teal: '#14b8a6',
  indigo: '#6366f1',
  orange: '#f97316',
  pink: '#ec4899',
  slate: '#64748b'
};
const LEGACY = {
  'text-neon-green': 'emerald',
  'text-neon-blue': 'sky',
  'text-neon-purple': 'violet',
  'text-neon-red': 'rose',
  'text-neon-amber': 'amber'
};
const PALETTE_KEYS = Object.keys(PALETTE);

export const tintFor = (category) => {
  if (!category) return PALETTE.slate;
  const key = LEGACY[category.color] || category.color;
  if (PALETTE[key]) return PALETTE[key];
  if (typeof key === 'string' && key.startsWith('#')) return key;
  const seed = String(category.id || category.name || '').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return PALETTE[PALETTE_KEYS[seed % (PALETTE_KEYS.length - 1)]];
};

export const PALETTE_CHOICES = PALETTE_KEYS.filter((k) => k !== 'slate');
