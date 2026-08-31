import type { Tab } from '../App';
import { useI18n } from '../i18n';

const TABS: { id: Tab; key: string }[] = [
  { id: 'tree', key: 'tabs.tree' },
  { id: 'calendar', key: 'tabs.calendar' },
  { id: 'stats', key: 'tabs.stats' },
  { id: 'settings', key: 'tabs.settings' },
];

export function Tabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useI18n();
  return (
    <nav className="mt-2 flex gap-4" aria-label="tabs">
      {TABS.map(({ id, key }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`border-b-2 px-1 pb-1 text-sm ${
            active === id
              ? 'border-blue-600 font-semibold text-blue-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t(key)}
        </button>
      ))}
    </nav>
  );
}
