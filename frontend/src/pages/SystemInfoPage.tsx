import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Server,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Printer,
  Archive,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plug,
  FolderKanban,
  Palette,
} from 'lucide-react';
import { api } from '../api/client';
import { Card } from '../components/Card';

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'text-bambu-green',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-bambu-dark rounded-lg">
      <div className={`p-2 rounded-lg bg-bambu-dark-tertiary ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-bambu-gray">{label}</p>
        <p className="text-lg font-semibold text-white truncate">{value}</p>
        {subValue && <p className="text-xs text-bambu-gray mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ percent, color = 'bg-bambu-green' }: { percent: number; color?: string }) {
  return (
    <div className="w-full h-2 bg-bambu-dark rounded-full overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-bambu-green" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export function SystemInfoPage() {
  const { t } = useTranslation();

  const { data: systemInfo, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['systemInfo'],
    queryFn: api.getSystemInfo,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-bambu-green animate-spin" />
      </div>
    );
  }

  if (!systemInfo) {
    return (
      <div className="p-6 text-center text-bambu-gray">
        {t('system.failedToLoad', 'Failed to load system information')}
      </div>
    );
  }

  const diskColor =
    systemInfo.storage.disk_percent_used > 90
      ? 'bg-red-500'
      : systemInfo.storage.disk_percent_used > 75
      ? 'bg-yellow-500'
      : 'bg-bambu-green';

  const memoryColor =
    systemInfo.memory.percent_used > 90
      ? 'bg-red-500'
      : systemInfo.memory.percent_used > 75
      ? 'bg-yellow-500'
      : 'bg-bambu-green';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('system.title', 'System Information')}</h1>
          <p className="text-bambu-gray mt-1">
            {t('system.subtitle', 'Monitor system resources and database statistics')}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-bambu-dark-secondary hover:bg-bambu-dark-tertiary rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      {/* Application Info */}
      <Section title={t('system.application', 'Application')} icon={Server}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={Server}
            label={t('system.version', 'Version')}
            value={`v${systemInfo.app.version}`}
          />
          <StatCard
            icon={Clock}
            label={t('system.uptime', 'System Uptime')}
            value={systemInfo.system.uptime_formatted}
          />
          <StatCard
            icon={Server}
            label={t('system.hostname', 'Hostname')}
            value={systemInfo.system.hostname}
          />
        </div>
      </Section>

      {/* Database Stats */}
      <Section title={t('system.database', 'Database')} icon={Database}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard
            icon={Archive}
            label={t('system.totalArchives', 'Total Archives')}
            value={systemInfo.database.archives}
          />
          <StatCard
            icon={CheckCircle2}
            label={t('system.completed', 'Completed')}
            value={systemInfo.database.archives_completed}
            color="text-green-500"
          />
          <StatCard
            icon={XCircle}
            label={t('system.failed', 'Failed')}
            value={systemInfo.database.archives_failed}
            color="text-red-500"
          />
          <StatCard
            icon={Loader2}
            label={t('system.printing', 'Printing')}
            value={systemInfo.database.archives_printing}
            color="text-yellow-500"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Printer}
            label={t('system.printers', 'Printers')}
            value={systemInfo.database.printers}
          />
          <StatCard
            icon={Palette}
            label={t('system.filaments', 'Filaments')}
            value={systemInfo.database.filaments}
          />
          <StatCard
            icon={FolderKanban}
            label={t('system.projects', 'Projects')}
            value={systemInfo.database.projects}
          />
          <StatCard
            icon={Plug}
            label={t('system.smartPlugs', 'Smart Plugs')}
            value={systemInfo.database.smart_plugs}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <StatCard
            icon={Clock}
            label={t('system.totalPrintTime', 'Total Print Time')}
            value={systemInfo.database.total_print_time_formatted}
          />
          <StatCard
            icon={Archive}
            label={t('system.totalFilament', 'Total Filament Used')}
            value={`${systemInfo.database.total_filament_kg} kg`}
            subValue={`${systemInfo.database.total_filament_grams.toLocaleString()} g`}
          />
        </div>
      </Section>

      {/* Connected Printers */}
      <Section title={t('system.connectedPrinters', 'Connected Printers')} icon={Printer}>
        <div className="flex items-center gap-4 mb-4">
          <div className="text-3xl font-bold text-bambu-green">
            {systemInfo.printers.connected}
          </div>
          <div className="text-bambu-gray">
            {t('system.ofTotal', 'of {{total}} printers connected', {
              total: systemInfo.printers.total,
            })}
          </div>
        </div>
        {systemInfo.printers.connected_list.length > 0 ? (
          <div className="space-y-2">
            {systemInfo.printers.connected_list.map((printer) => (
              <div
                key={printer.id}
                className="flex items-center justify-between p-3 bg-bambu-dark rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-bambu-green" />
                  <span className="font-medium text-white">{printer.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-bambu-gray">
                  <span>{printer.model}</span>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      printer.state === 'RUNNING'
                        ? 'bg-bambu-green/20 text-bambu-green'
                        : printer.state === 'IDLE'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-bambu-dark-tertiary'
                    }`}
                  >
                    {printer.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-bambu-gray">{t('system.noPrintersConnected', 'No printers connected')}</p>
        )}
      </Section>

      {/* Storage */}
      <Section title={t('system.storage', 'Storage')} icon={HardDrive}>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-bambu-gray">{t('system.diskUsage', 'Disk Usage')}</span>
              <span className="text-white">
                {systemInfo.storage.disk_used_formatted} / {systemInfo.storage.disk_total_formatted}
              </span>
            </div>
            <ProgressBar percent={systemInfo.storage.disk_percent_used} color={diskColor} />
            <p className="text-xs text-bambu-gray mt-1">
              {systemInfo.storage.disk_free_formatted} {t('system.free', 'free')} (
              {(100 - systemInfo.storage.disk_percent_used).toFixed(1)}%)
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              icon={Archive}
              label={t('system.archiveStorage', 'Archive Storage')}
              value={systemInfo.storage.archive_size_formatted}
            />
            <StatCard
              icon={Database}
              label={t('system.databaseSize', 'Database Size')}
              value={systemInfo.storage.database_size_formatted}
            />
          </div>
        </div>
      </Section>

      {/* System Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Memory */}
        <Section title={t('system.memory', 'Memory')} icon={MemoryStick}>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-bambu-gray">{t('system.memoryUsage', 'Memory Usage')}</span>
                <span className="text-white">
                  {systemInfo.memory.used_formatted} / {systemInfo.memory.total_formatted}
                </span>
              </div>
              <ProgressBar percent={systemInfo.memory.percent_used} color={memoryColor} />
              <p className="text-xs text-bambu-gray mt-1">
                {systemInfo.memory.available_formatted} {t('system.available', 'available')}
              </p>
            </div>
          </div>
        </Section>

        {/* CPU */}
        <Section title={t('system.cpu', 'CPU')} icon={Cpu}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                icon={Cpu}
                label={t('system.cores', 'Cores')}
                value={systemInfo.cpu.count}
                subValue={`${systemInfo.cpu.count_logical} logical`}
              />
              <StatCard
                icon={Cpu}
                label={t('system.usage', 'Usage')}
                value={`${systemInfo.cpu.percent}%`}
              />
            </div>
          </div>
        </Section>
      </div>

      {/* System Details */}
      <Section title={t('system.systemDetails', 'System Details')} icon={Server}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Server}
            label={t('system.os', 'Operating System')}
            value={systemInfo.system.platform}
            subValue={systemInfo.system.platform_release}
          />
          <StatCard
            icon={Cpu}
            label={t('system.architecture', 'Architecture')}
            value={systemInfo.system.architecture}
          />
          <StatCard
            icon={Server}
            label={t('system.python', 'Python')}
            value={systemInfo.system.python_version}
          />
          <StatCard
            icon={Clock}
            label={t('system.bootTime', 'Boot Time')}
            value={new Date(systemInfo.system.boot_time).toLocaleString()}
          />
        </div>
      </Section>
    </div>
  );
}
