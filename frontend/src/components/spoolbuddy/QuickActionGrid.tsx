import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Scale, Edit, Cpu, History } from 'lucide-react';

interface QuickActionGridProps {
  onUpdateWeight: () => void;
  onEditSpool: () => void;
  onAssignAms: () => void;
  onViewHistory: () => void;
}

export function QuickActionGrid({ onUpdateWeight, onEditSpool, onAssignAms, onViewHistory }: QuickActionGridProps) {
  const { t } = useTranslation();

  const actions = [
    { icon: Cpu, label: t('spoolbuddy.actions.assignAms'), onClick: onAssignAms, variant: 'primary' as const },
    { icon: Scale, label: t('spoolbuddy.actions.updateWeight'), onClick: onUpdateWeight, variant: 'secondary' as const },
    { icon: Edit, label: t('spoolbuddy.actions.editSpool'), onClick: onEditSpool, variant: 'secondary' as const },
    { icon: History, label: t('spoolbuddy.actions.viewHistory'), onClick: onViewHistory, variant: 'secondary' as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map(({ icon: Icon, label, onClick, variant }) => (
        <Button
          key={label}
          variant={variant}
          className="h-[64px] text-[14px] flex-col gap-1"
          onClick={onClick}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}
