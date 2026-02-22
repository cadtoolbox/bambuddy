import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { api } from '../../api/client';

interface InventorySpool {
  id: number;
  material: string;
  subtype: string | null;
  color_name: string | null;
  rgba: string | null;
  brand: string | null;
  label_weight: number;
  weight_used: number;
}

export function SpoolBuddyInventoryPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { data: spools, isLoading } = useQuery({
    queryKey: ['inventory-spools'],
    queryFn: () => api.getSpools(),
  });

  const spoolList = (spools || []) as InventorySpool[];
  const filtered = spoolList.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.material.toLowerCase().includes(q) ||
      (s.brand?.toLowerCase().includes(q)) ||
      (s.color_name?.toLowerCase().includes(q))
    );
  });

  return (
    <div className="h-[512px] flex flex-col p-4">
      {/* Search + Add */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('spoolbuddy.inventory.search')}
            className="w-full h-[48px] bg-bg-secondary border border-bambu-dark-tertiary rounded-lg pl-10 pr-4 text-text-primary text-[14px] placeholder:text-text-muted"
          />
        </div>
        <Button variant="primary" className="h-[48px] px-4">
          <Plus size={18} />
          <span className="ml-1">{t('common.add')}</span>
        </Button>
      </div>

      {/* Spool grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((spool) => {
            const remaining = Math.max(0, spool.label_weight - spool.weight_used);
            const pct = spool.label_weight > 0 ? Math.round((remaining / spool.label_weight) * 100) : 0;
            const color = spool.rgba ? `#${spool.rgba.substring(0, 6)}` : '#808080';
            const materialLabel = spool.subtype ? `${spool.material} ${spool.subtype}` : spool.material;

            return (
              <button
                key={spool.id}
                className="flex items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-bambu-dark-tertiary active:bg-bambu-dark-tertiary transition-colors text-left"
              >
                <div
                  className="w-[32px] h-[32px] rounded-full border-2 border-bambu-dark-tertiary flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-text-primary truncate">{materialLabel}</p>
                  <p className="text-[12px] text-text-secondary truncate">
                    {[spool.brand, spool.color_name].filter(Boolean).join(' - ')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-text-muted">{remaining}g</span>
                    <div className="flex-1 h-1.5 bg-bambu-dark-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-bambu-green"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-text-muted text-[14px]">{t('spoolbuddy.inventory.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
