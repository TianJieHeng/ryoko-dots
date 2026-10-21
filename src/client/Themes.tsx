import { useState } from 'react';
export const themes = ['neon-relay', 'redline-comms', 'blackout-channel'] as const;
type Theme = typeof themes[number];
const labels = ['Neon Relay', 'Redline Comms', 'Blackout Channel'];
export function applySavedTheme() {
  let theme = 'neon-relay';
  try { const saved = localStorage.getItem('dots.theme'); if (themes.includes(saved as Theme)) theme = saved!; } catch { /* Flat fallback remains usable. */ }
  document.documentElement.dataset.theme = theme;
}
export function ThemePicker() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'neon-relay');
  return <label className="theme-picker">Appearance<select aria-label="Theme" value={theme} onChange={e => { const value = e.target.value; document.documentElement.dataset.theme = value; setTheme(value); try { localStorage.setItem('dots.theme', value); } catch { /* Session-only selection. */ } }}>{themes.map((value, i) => <option key={value} value={value}>{labels[i]}</option>)}</select></label>;
}
