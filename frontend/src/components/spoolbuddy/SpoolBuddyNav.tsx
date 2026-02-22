import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scale, Cpu, Package, Printer, Settings, ArrowLeft } from 'lucide-react';

const navItems = [
  { to: '/spoolbuddy', icon: Scale, labelKey: 'spoolbuddy.nav.dashboard', end: true },
  { to: '/spoolbuddy/ams', icon: Cpu, labelKey: 'spoolbuddy.nav.ams' },
  { to: '/spoolbuddy/inventory', icon: Package, labelKey: 'spoolbuddy.nav.inventory' },
  { to: '/spoolbuddy/printers', icon: Printer, labelKey: 'spoolbuddy.nav.printers' },
  { to: '/spoolbuddy/settings', icon: Settings, labelKey: 'spoolbuddy.nav.settings' },
];

interface SpoolBuddyNavProps {
  isKiosk: boolean;
}

export function SpoolBuddyNav({ isKiosk }: SpoolBuddyNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="h-[48px] bg-bg-secondary border-b border-bambu-dark-tertiary flex items-center px-2 gap-1">
      {!isKiosk && (
        <NavLink
          to="/"
          className="flex items-center gap-1 px-3 h-[40px] rounded-lg text-text-secondary hover:text-white hover:bg-bambu-dark-tertiary text-[13px]"
        >
          <ArrowLeft size={16} />
        </NavLink>
      )}

      <div className="flex items-center gap-1 px-2">
        <span className="text-bambu-green font-bold text-[15px]">SpoolBuddy</span>
      </div>

      <div className="flex items-center gap-1 flex-1">
        {navItems.map(({ to, icon: Icon, labelKey, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 h-[40px] rounded-lg text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-bambu-green text-white'
                  : 'text-text-secondary hover:text-white hover:bg-bambu-dark-tertiary'
              }`
            }
          >
            <Icon size={16} />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
