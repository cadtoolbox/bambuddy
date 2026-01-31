import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Plug, AlertTriangle, RotateCcw, Bell, Download, RefreshCw, ExternalLink, Globe, Droplets, Thermometer, FileText, Edit2, Send, CheckCircle, XCircle, History, Trash2, Zap, TrendingUp, Calendar, DollarSign, Power, PowerOff, Key, Copy, Database, X, Shield, Printer, Cylinder, Wifi, Home, Video, Users, Lock, Unlock, ChevronDown, ChevronRight, Check, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { formatDateOnly } from '../utils/date';
import type { AppSettings, AppSettingsUpdate, SmartPlug, SmartPlugStatus, NotificationProvider, NotificationTemplate, UpdateStatus, GitHubBackupStatus, CloudAuthStatus, UserCreate, UserUpdate, UserResponse, Group, GroupCreate, GroupUpdate, Permission, PermissionCategory } from '../api/client';
import { Card, CardContent, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { SmartPlugCard } from '../components/SmartPlugCard';
import { AddSmartPlugModal } from '../components/AddSmartPlugModal';
import { NotificationProviderCard } from '../components/NotificationProviderCard';
import { AddNotificationModal } from '../components/AddNotificationModal';
import { NotificationTemplateEditor } from '../components/NotificationTemplateEditor';
import { NotificationLogViewer } from '../components/NotificationLogViewer';
import { ConfirmModal } from '../components/ConfirmModal';
import { SpoolmanSettings } from '../components/SpoolmanSettings';
import { ExternalLinksSettings } from '../components/ExternalLinksSettings';
import { VirtualPrinterSettings } from '../components/VirtualPrinterSettings';
import { GitHubBackupSettings } from '../components/GitHubBackupSettings';
import { APIBrowser } from '../components/APIBrowser';
import { virtualPrinterApi } from '../api/client';
import { defaultNavItems, getDefaultView, setDefaultView } from '../components/Layout';
import { availableLanguages } from '../i18n';
import { useToast } from '../contexts/ToastContext';
import { useTheme, type ThemeStyle, type DarkBackground, type LightBackground, type ThemeAccent } from '../contexts/ThemeContext';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Palette } from 'lucide-react';

const validTabs = ['general', 'network', 'plugs', 'notifications', 'filament', 'apikeys', 'virtual-printer', 'users', 'backup'] as const;
type TabType = typeof validTabs[number];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { authEnabled, user, refreshAuth } = useAuth();
  const {
    mode,
    darkStyle, darkBackground, darkAccent,
    lightStyle, lightBackground, lightAccent,
    setDarkStyle, setDarkBackground, setDarkAccent,
    setLightStyle, setLightBackground, setLightAccent,
  } = useTheme();
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [showPlugModal, setShowPlugModal] = useState(false);
  const [editingPlug, setEditingPlug] = useState<SmartPlug | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<NotificationProvider | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [defaultView, setDefaultViewState] = useState<string>(getDefaultView());

  // Initialize tab from URL params
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam && validTabs.includes(tabParam as TabType) ? tabParam as TabType : 'general';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'general') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab);
    }
    setSearchParams(searchParams, { replace: true });
  };
  const [showCreateAPIKey, setShowCreateAPIKey] = useState(false);
  const [newAPIKeyName, setNewAPIKeyName] = useState('');
  const [newAPIKeyPermissions, setNewAPIKeyPermissions] = useState({
    can_queue: true,
    can_control_printer: false,
    can_read_status: true,
  });
  const [createdAPIKey, setCreatedAPIKey] = useState<string | null>(null);
  const [showDeleteAPIKeyConfirm, setShowDeleteAPIKeyConfirm] = useState<number | null>(null);
  const [testApiKey, setTestApiKey] = useState('');

  // Confirm modal states
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [showClearStorageConfirm, setShowClearStorageConfirm] = useState(false);
  const [showBulkPlugConfirm, setShowBulkPlugConfirm] = useState<'on' | 'off' | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showDisableAuthConfirm, setShowDisableAuthConfirm] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordData, setChangePasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // User management state
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [userFormData, setUserFormData] = useState<{
    username: string;
    password: string;
    confirmPassword: string;
    role: string;
    group_ids: number[];
  }>({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    group_ids: [],
  });

  // Group management state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);
  const [groupFormData, setGroupFormData] = useState<{
    name: string;
    description: string;
    permissions: Permission[];
  }>({
    name: '',
    description: '',
    permissions: [],
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Home Assistant test connection state
  const [haTestResult, setHaTestResult] = useState<{ success: boolean; message: string | null; error: string | null } | null>(null);
  const [haTestLoading, setHaTestLoading] = useState(false);

  // External camera test state
  const [extCameraTestResults, setExtCameraTestResults] = useState<Record<number, { success: boolean; error?: string; resolution?: string } | null>>({});
  const [extCameraTestLoading, setExtCameraTestLoading] = useState<Record<number, boolean>>({});

  const handleDefaultViewChange = (path: string) => {
    setDefaultViewState(path);
    setDefaultView(path);
  };

  const handleResetSidebarOrder = () => {
    localStorage.removeItem('sidebarOrder');
    window.location.reload();
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const { data: smartPlugs, isLoading: plugsLoading } = useQuery({
    queryKey: ['smart-plugs'],
    queryFn: api.getSmartPlugs,
  });

  // Fetch energy data for all smart plugs when on the plugs tab
  const { data: plugEnergySummary, isLoading: energyLoading } = useQuery({
    queryKey: ['smart-plugs-energy', smartPlugs?.map(p => p.id)],
    queryFn: async () => {
      if (!smartPlugs || smartPlugs.length === 0) return null;
      const statuses = await Promise.all(
        smartPlugs.filter(p => p.enabled).map(async (plug) => {
          try {
            const status = await api.getSmartPlugStatus(plug.id);
            return { plug, status };
          } catch {
            return { plug, status: null as SmartPlugStatus | null };
          }
        })
      );

      // Aggregate energy data
      let totalPower = 0;
      let totalToday = 0;
      let totalYesterday = 0;
      let totalLifetime = 0;
      let reachableCount = 0;

      for (const { plug, status } of statuses) {
        // For MQTT plugs, consider reachable if we have power data
        const hasMqttData = plug.plug_type === 'mqtt' && (status?.energy?.power != null);
        const isReachable = (status?.reachable || hasMqttData) && status?.energy;

        if (isReachable) {
          reachableCount++;
          if (status.energy?.power != null) totalPower += status.energy.power;
          if (status.energy?.today != null) totalToday += status.energy.today;
          if (status.energy?.yesterday != null) totalYesterday += status.energy.yesterday;
          if (status.energy?.total != null) totalLifetime += status.energy.total;
        }
      }

      return {
        totalPower,
        totalToday,
        totalYesterday,
        totalLifetime,
        reachableCount,
        totalPlugs: smartPlugs.filter(p => p.enabled).length,
      };
    },
    enabled: activeTab === 'plugs' && !!smartPlugs && smartPlugs.length > 0,
    refetchInterval: activeTab === 'plugs' ? 10000 : false, // Refresh every 10s when on plugs tab
  });

  const { data: notificationProviders, isLoading: providersLoading } = useQuery({
    queryKey: ['notification-providers'],
    queryFn: api.getNotificationProviders,
  });

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: api.getAPIKeys,
  });

  const createAPIKeyMutation = useMutation({
    mutationFn: (data: { name: string; can_queue: boolean; can_control_printer: boolean; can_read_status: boolean }) =>
      api.createAPIKey(data),
    onSuccess: (data) => {
      setCreatedAPIKey(data.key || null);
      setShowCreateAPIKey(false);
      setNewAPIKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('API key created');
    },
    onError: (error: Error) => {
      showToast(`Failed to create API key: ${error.message}`, 'error');
    },
  });

  const deleteAPIKeyMutation = useMutation({
    mutationFn: (id: number) => api.deleteAPIKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('API key deleted');
    },
    onError: (error: Error) => {
      showToast(`Failed to delete API key: ${error.message}`, 'error');
    },
  });

  const { data: printers } = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
  });

  const { data: notificationTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: api.getNotificationTemplates,
  });

  // Virtual printer status for tab indicator
  const { data: virtualPrinterSettings } = useQuery({
    queryKey: ['virtual-printer-settings'],
    queryFn: virtualPrinterApi.getSettings,
    refetchInterval: 10000,
  });
  const virtualPrinterRunning = virtualPrinterSettings?.status?.running ?? false;

  const { data: ffmpegStatus } = useQuery({
    queryKey: ['ffmpeg-status'],
    queryFn: api.checkFfmpeg,
  });

  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: api.getVersion,
  });

  const { data: updateCheck, refetch: refetchUpdateCheck, isRefetching: isCheckingUpdate } = useQuery({
    queryKey: ['updateCheck'],
    queryFn: api.checkForUpdates,
    staleTime: 5 * 60 * 1000,
  });

  const { data: updateStatus, refetch: refetchUpdateStatus } = useQuery({
    queryKey: ['updateStatus'],
    queryFn: api.getUpdateStatus,
    refetchInterval: (query) => {
      const status = query.state.data as UpdateStatus | undefined;
      // Poll while update is in progress
      if (status?.status === 'downloading' || status?.status === 'installing') {
        return 1000;
      }
      return false;
    },
  });

  // MQTT status for Network tab
  const { data: mqttStatus } = useQuery({
    queryKey: ['mqtt-status'],
    queryFn: api.getMQTTStatus,
    refetchInterval: activeTab === 'network' ? 5000 : false, // Poll every 5s when on Network tab
  });

  // GitHub backup status for Backup tab indicator
  const { data: githubBackupStatus } = useQuery<GitHubBackupStatus>({
    queryKey: ['github-backup-status'],
    queryFn: api.getGitHubBackupStatus,
  });

  // Cloud auth status for Backup tab indicator
  const { data: cloudAuthStatus } = useQuery<CloudAuthStatus>({
    queryKey: ['cloud-status'],
    queryFn: api.getCloudStatus,
  });

  // User management queries and mutations
  const { hasPermission } = useAuth();

  const { data: usersData = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: authEnabled && hasPermission('users:read'),
  });

  const { data: groupsData = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.getGroups(),
    enabled: authEnabled && hasPermission('groups:read'),
  });

  const { data: permissionsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.getPermissions(),
    enabled: authEnabled && hasPermission('groups:read'),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: UserCreate) => api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreateUserModal(false);
      setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
      showToast('User created successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserUpdate }) => api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowEditUserModal(false);
      setEditingUserId(null);
      setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
      showToast('User updated successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User deleted successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: GroupCreate) => api.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreateGroupModal(false);
      resetGroupForm();
      showToast('Group created successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: GroupUpdate }) => api.updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setEditingGroup(null);
      resetGroupForm();
      showToast('Group updated successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => api.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      showToast('Group deleted successfully');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  // User management handlers
  const handleCreateUser = () => {
    if (!userFormData.username || !userFormData.password) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    if (userFormData.password !== userFormData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (userFormData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    createUserMutation.mutate({
      username: userFormData.username,
      password: userFormData.password,
      role: userFormData.role,
      group_ids: userFormData.group_ids.length > 0 ? userFormData.group_ids : undefined,
    });
  };

  const handleUpdateUser = (id: number) => {
    if (userFormData.password) {
      if (userFormData.password !== userFormData.confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }
      if (userFormData.password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
      }
    }
    const updateData: UserUpdate = {
      username: userFormData.username || undefined,
      password: userFormData.password || undefined,
      role: userFormData.role,
      group_ids: userFormData.group_ids,
    };
    if (!updateData.password) {
      delete updateData.password;
    }
    updateUserMutation.mutate({ id, data: updateData });
  };

  const startEditUser = (userToEdit: UserResponse) => {
    setEditingUserId(userToEdit.id);
    setUserFormData({
      username: userToEdit.username,
      password: '',
      confirmPassword: '',
      role: userToEdit.role,
      group_ids: userToEdit.groups?.map(g => g.id) || [],
    });
    setShowEditUserModal(true);
  };

  const toggleUserGroup = (groupId: number) => {
    setUserFormData(prev => ({
      ...prev,
      group_ids: prev.group_ids.includes(groupId)
        ? prev.group_ids.filter(id => id !== groupId)
        : [...prev.group_ids, groupId],
    }));
  };

  // Group management handlers
  const resetGroupForm = () => {
    setGroupFormData({ name: '', description: '', permissions: [] });
    setExpandedCategories(new Set());
  };

  const handleCreateGroup = () => {
    if (!groupFormData.name.trim()) {
      showToast('Please enter a group name', 'error');
      return;
    }
    createGroupMutation.mutate({
      name: groupFormData.name,
      description: groupFormData.description || undefined,
      permissions: groupFormData.permissions,
    });
  };

  const handleUpdateGroup = () => {
    if (!editingGroup) return;
    if (!groupFormData.name.trim()) {
      showToast('Please enter a group name', 'error');
      return;
    }
    updateGroupMutation.mutate({
      id: editingGroup.id,
      data: {
        name: groupFormData.name !== editingGroup.name ? groupFormData.name : undefined,
        description: groupFormData.description,
        permissions: groupFormData.permissions,
      },
    });
  };

  const startEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
      description: group.description || '',
      permissions: group.permissions,
    });
    const cats = new Set<string>();
    permissionsData?.categories.forEach((cat) => {
      if (cat.permissions.some((p) => group.permissions.includes(p.value))) {
        cats.add(cat.name);
      }
    });
    setExpandedCategories(cats);
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const togglePermission = (permission: Permission) => {
    setGroupFormData((prev) => {
      const permissions = prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission];
      return { ...prev, permissions };
    });
  };

  const toggleCategoryPermissions = (category: PermissionCategory, checked: boolean) => {
    setGroupFormData((prev) => {
      const categoryPerms = category.permissions.map((p) => p.value);
      const otherPerms = prev.permissions.filter((p) => !categoryPerms.includes(p));
      const permissions = checked ? [...otherPerms, ...categoryPerms] : otherPerms;
      return { ...prev, permissions };
    });
  };

  const isCategoryFullySelected = (category: PermissionCategory) => {
    return category.permissions.every((p) => groupFormData.permissions.includes(p.value));
  };

  const isCategoryPartiallySelected = (category: PermissionCategory) => {
    const selected = category.permissions.filter((p) => groupFormData.permissions.includes(p.value));
    return selected.length > 0 && selected.length < category.permissions.length;
  };

  const applyUpdateMutation = useMutation({
    mutationFn: api.applyUpdate,
    onSuccess: (data) => {
      if (data.is_docker) {
        showToast(data.message, 'error');
      } else {
        refetchUpdateStatus();
      }
    },
  });

  // Test all notification providers
  const [testAllResult, setTestAllResult] = useState<{
    tested: number;
    success: number;
    failed: number;
    results: Array<{
      provider_id: number;
      provider_name: string;
      provider_type: string;
      success: boolean;
      message: string;
    }>;
  } | null>(null);

  const testAllMutation = useMutation({
    mutationFn: api.testAllNotificationProviders,
    onSuccess: (data) => {
      setTestAllResult(data);
      queryClient.invalidateQueries({ queryKey: ['notification-providers'] });
      if (data.failed === 0) {
        showToast(`All ${data.tested} providers tested successfully!`, 'success');
      } else {
        showToast(`${data.success}/${data.tested} providers succeeded`, data.failed > 0 ? 'error' : 'success');
      }
    },
    onError: (error: Error) => {
      showToast(`Failed to test providers: ${error.message}`, 'error');
    },
  });

  // Bulk action for smart plugs
  const bulkPlugActionMutation = useMutation({
    mutationFn: async (action: 'on' | 'off') => {
      if (!smartPlugs) return { success: 0, failed: 0 };
      const enabledPlugs = smartPlugs.filter(p => p.enabled);
      const results = await Promise.all(
        enabledPlugs.map(async (plug) => {
          try {
            await api.controlSmartPlug(plug.id, action);
            return { success: true };
          } catch {
            return { success: false };
          }
        })
      );
      return {
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      };
    },
    onSuccess: (data, action) => {
      queryClient.invalidateQueries({ queryKey: ['smart-plugs'] });
      queryClient.invalidateQueries({ queryKey: ['smart-plugs-energy'] });
      if (data.failed === 0) {
        showToast(`All ${data.success} plugs turned ${action}`, 'success');
      } else {
        showToast(`${data.success} plugs turned ${action}, ${data.failed} failed`, 'error');
      }
    },
    onError: (error: Error) => {
      showToast(`Failed: ${error.message}`, 'error');
    },
  });

  // Ref for debounce timeout
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Sync local state when settings load
  useEffect(() => {
    if (settings && !localSettings) {
      // Auto-detect external_url from browser if not set
      const settingsWithExternalUrl = {
        ...settings,
        external_url: settings.external_url || window.location.origin,
      };
      setLocalSettings(settingsWithExternalUrl);
      // Mark initial load complete after a short delay
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    }
  }, [settings, localSettings]);

  const updateMutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      // Sync localSettings with the saved data to prevent re-triggering saves
      setLocalSettings(data);
      // Invalidate archive stats to reflect energy tracking mode change
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] });
      showToast('Settings saved', 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to save: ${error.message}`, 'error');
    },
    onSettled: () => {
      // Reset saving flag when mutation completes (success or error)
      isSavingRef.current = false;
    },
  });

  const updatePrinterMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ external_camera_url: string | null; external_camera_type: string | null; external_camera_enabled: boolean }> }) =>
      api.updatePrinter(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['printers'] });
      showToast('Camera settings saved', 'success');
    },
    onError: (error: Error) => {
      showToast(`Failed to update printer: ${error.message}`, 'error');
    },
  });

  // Debounced auto-save when localSettings change
  useEffect(() => {
    // Skip if initial load or no settings
    if (isInitialLoadRef.current || !localSettings || !settings) {
      return;
    }

    // Check if there are actual changes
    const hasChanges =
      settings.auto_archive !== localSettings.auto_archive ||
      settings.save_thumbnails !== localSettings.save_thumbnails ||
      settings.capture_finish_photo !== localSettings.capture_finish_photo ||
      settings.default_filament_cost !== localSettings.default_filament_cost ||
      settings.currency !== localSettings.currency ||
      settings.energy_cost_per_kwh !== localSettings.energy_cost_per_kwh ||
      settings.energy_tracking_mode !== localSettings.energy_tracking_mode ||
      settings.check_updates !== localSettings.check_updates ||
      (settings.check_printer_firmware ?? true) !== (localSettings.check_printer_firmware ?? true) ||
      settings.notification_language !== localSettings.notification_language ||
      settings.ams_humidity_good !== localSettings.ams_humidity_good ||
      settings.ams_humidity_fair !== localSettings.ams_humidity_fair ||
      settings.ams_temp_good !== localSettings.ams_temp_good ||
      settings.ams_temp_fair !== localSettings.ams_temp_fair ||
      settings.ams_history_retention_days !== localSettings.ams_history_retention_days ||
      settings.per_printer_mapping_expanded !== localSettings.per_printer_mapping_expanded ||
      settings.date_format !== localSettings.date_format ||
      settings.time_format !== localSettings.time_format ||
      settings.default_printer_id !== localSettings.default_printer_id ||
      settings.ftp_retry_enabled !== localSettings.ftp_retry_enabled ||
      settings.ftp_retry_count !== localSettings.ftp_retry_count ||
      settings.ftp_retry_delay !== localSettings.ftp_retry_delay ||
      settings.ftp_timeout !== localSettings.ftp_timeout ||
      settings.mqtt_enabled !== localSettings.mqtt_enabled ||
      settings.mqtt_broker !== localSettings.mqtt_broker ||
      settings.mqtt_port !== localSettings.mqtt_port ||
      settings.mqtt_username !== localSettings.mqtt_username ||
      settings.mqtt_password !== localSettings.mqtt_password ||
      settings.mqtt_topic_prefix !== localSettings.mqtt_topic_prefix ||
      settings.mqtt_use_tls !== localSettings.mqtt_use_tls ||
      settings.external_url !== localSettings.external_url ||
      settings.ha_enabled !== localSettings.ha_enabled ||
      settings.ha_url !== localSettings.ha_url ||
      settings.ha_token !== localSettings.ha_token ||
      (settings.library_archive_mode ?? 'ask') !== (localSettings.library_archive_mode ?? 'ask') ||
      Number(settings.library_disk_warning_gb ?? 5) !== Number(localSettings.library_disk_warning_gb ?? 5) ||
      (settings.camera_view_mode ?? 'window') !== (localSettings.camera_view_mode ?? 'window') ||
      settings.prometheus_enabled !== localSettings.prometheus_enabled ||
      settings.prometheus_token !== localSettings.prometheus_token;

    if (!hasChanges) {
      return;
    }

    // Don't queue more saves while one is in progress
    if (isSavingRef.current) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new debounced save (500ms delay)
    saveTimeoutRef.current = setTimeout(() => {
      // Skip if a save is already in progress
      if (isSavingRef.current) {
        return;
      }
      isSavingRef.current = true;
      // Only send the fields we manage on this page (exclude virtual_printer_* which are managed separately)
      const settingsToSave: AppSettingsUpdate = {
        auto_archive: localSettings.auto_archive,
        save_thumbnails: localSettings.save_thumbnails,
        capture_finish_photo: localSettings.capture_finish_photo,
        default_filament_cost: localSettings.default_filament_cost,
        currency: localSettings.currency,
        energy_cost_per_kwh: localSettings.energy_cost_per_kwh,
        energy_tracking_mode: localSettings.energy_tracking_mode,
        check_updates: localSettings.check_updates,
        check_printer_firmware: localSettings.check_printer_firmware,
        notification_language: localSettings.notification_language,
        ams_humidity_good: localSettings.ams_humidity_good,
        ams_humidity_fair: localSettings.ams_humidity_fair,
        ams_temp_good: localSettings.ams_temp_good,
        ams_temp_fair: localSettings.ams_temp_fair,
        ams_history_retention_days: localSettings.ams_history_retention_days,
        per_printer_mapping_expanded: localSettings.per_printer_mapping_expanded,
        date_format: localSettings.date_format,
        time_format: localSettings.time_format,
        default_printer_id: localSettings.default_printer_id,
        ftp_retry_enabled: localSettings.ftp_retry_enabled,
        ftp_retry_count: localSettings.ftp_retry_count,
        ftp_retry_delay: localSettings.ftp_retry_delay,
        ftp_timeout: localSettings.ftp_timeout,
        mqtt_enabled: localSettings.mqtt_enabled,
        mqtt_broker: localSettings.mqtt_broker,
        mqtt_port: localSettings.mqtt_port,
        mqtt_username: localSettings.mqtt_username,
        mqtt_password: localSettings.mqtt_password,
        mqtt_topic_prefix: localSettings.mqtt_topic_prefix,
        mqtt_use_tls: localSettings.mqtt_use_tls,
        external_url: localSettings.external_url,
        ha_enabled: localSettings.ha_enabled,
        ha_url: localSettings.ha_url,
        ha_token: localSettings.ha_token,
        library_archive_mode: localSettings.library_archive_mode,
        library_disk_warning_gb: localSettings.library_disk_warning_gb,
        camera_view_mode: localSettings.camera_view_mode,
        prometheus_enabled: localSettings.prometheus_enabled,
        prometheus_token: localSettings.prometheus_token,
      };
      updateMutation.mutate(settingsToSave);
    }, 500);

    // Cleanup on unmount or when localSettings changes again
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localSettings, settings, updateMutation]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings(prev => prev ? { ...prev, [key]: value } : null);
  }, []);

  const handleTestExternalCamera = async (printerId: number, url: string, cameraType: string) => {
    if (!url) {
      showToast('Please enter a camera URL', 'error');
      return;
    }
    setExtCameraTestLoading(prev => ({ ...prev, [printerId]: true }));
    setExtCameraTestResults(prev => ({ ...prev, [printerId]: null }));
    try {
      const result = await api.testExternalCamera(printerId, url, cameraType);
      setExtCameraTestResults(prev => ({ ...prev, [printerId]: result }));
      if (result.success) {
        showToast(`Camera connected${result.resolution ? ` (${result.resolution})` : ''}`, 'success');
      } else {
        showToast(result.error || 'Connection failed', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      setExtCameraTestResults(prev => ({ ...prev, [printerId]: { success: false, error: message } }));
      showToast(message, 'error');
    } finally {
      setExtCameraTestLoading(prev => ({ ...prev, [printerId]: false }));
    }
  };

  // Local state for camera URL inputs (to avoid saving on every keystroke)
  const [localCameraUrls, setLocalCameraUrls] = useState<Record<number, string>>({});
  const cameraUrlSaveTimeoutRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const initializedPrinterUrlsRef = useRef<Set<number>>(new Set());

  // Initialize local camera URLs from printer data
  useEffect(() => {
    if (printers) {
      const urls: Record<number, string> = {};
      printers.forEach(p => {
        if (p.external_camera_url && !initializedPrinterUrlsRef.current.has(p.id)) {
          urls[p.id] = p.external_camera_url;
          initializedPrinterUrlsRef.current.add(p.id);
        }
      });
      if (Object.keys(urls).length > 0) {
        setLocalCameraUrls(prev => ({ ...prev, ...urls }));
      }
    }
  }, [printers]);

  const handleCameraUrlChange = (printerId: number, url: string) => {
    // Update local state immediately for responsive UI
    setLocalCameraUrls(prev => ({ ...prev, [printerId]: url }));

    // Clear existing timeout for this printer
    if (cameraUrlSaveTimeoutRef.current[printerId]) {
      clearTimeout(cameraUrlSaveTimeoutRef.current[printerId]);
    }

    // Debounce the save (800ms delay)
    cameraUrlSaveTimeoutRef.current[printerId] = setTimeout(() => {
      updatePrinterMutation.mutate({
        id: printerId,
        data: { external_camera_url: url || null }
      });
    }, 800);
  };

  const handleUpdatePrinterCamera = (printerId: number, updates: { type?: string; enabled?: boolean }) => {
    const data: Partial<{ external_camera_type: string | null; external_camera_enabled: boolean }> = {};
    if (updates.type !== undefined) data.external_camera_type = updates.type || null;
    if (updates.enabled !== undefined) data.external_camera_enabled = updates.enabled;
    updatePrinterMutation.mutate({ id: printerId, data });
  };

  if (isLoading || !localSettings) {
    return (
      <div className="p-4 md:p-8 flex justify-center">
        <Loader2 className="w-8 h-8 text-bambu-green animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-bambu-gray">Configure Bambuddy</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-bambu-dark-tertiary overflow-x-auto">
        <button
          onClick={() => handleTabChange('general')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'general'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          General
        </button>
        <button
          onClick={() => handleTabChange('plugs')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'plugs'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Plug className="w-4 h-4" />
          Smart Plugs
          {smartPlugs && smartPlugs.length > 0 && (
            <span className="text-xs bg-bambu-dark-tertiary px-1.5 py-0.5 rounded-full">
              {smartPlugs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('notifications')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'notifications'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
          {notificationProviders && notificationProviders.length > 0 && (
            <span className="text-xs bg-bambu-dark-tertiary px-1.5 py-0.5 rounded-full">
              {notificationProviders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('filament')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'filament'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Cylinder className="w-4 h-4" />
          Filament
        </button>
        <button
          onClick={() => handleTabChange('network')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'network'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Wifi className="w-4 h-4" />
          Network
          <span className={`w-2 h-2 rounded-full ${mqttStatus?.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
        </button>
        <button
          onClick={() => handleTabChange('apikeys')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'apikeys'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Key className="w-4 h-4" />
          API Keys
          {apiKeys && apiKeys.length > 0 && (
            <span className="text-xs bg-bambu-dark-tertiary px-1.5 py-0.5 rounded-full">
              {apiKeys.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('virtual-printer')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'virtual-printer'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Printer className="w-4 h-4" />
          Virtual Printer
          <span className={`w-2 h-2 rounded-full ${virtualPrinterRunning ? 'bg-green-400' : 'bg-gray-500'}`} />
        </button>
        <button
          onClick={() => handleTabChange('users')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'users'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Users className="w-4 h-4" />
          Users
          {authEnabled && (
            <span className={`w-2 h-2 rounded-full ${authEnabled ? 'bg-green-400' : 'bg-gray-500'}`} />
          )}
        </button>
        <button
          onClick={() => handleTabChange('backup')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'backup'
              ? 'text-bambu-green border-bambu-green'
              : 'text-bambu-gray hover:text-gray-900 dark:hover:text-white border-transparent'
          }`}
        >
          <Database className="w-4 h-4" />
          Backup
          <span className={`w-2 h-2 rounded-full ${cloudAuthStatus?.is_authenticated && githubBackupStatus?.configured && githubBackupStatus?.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left Column - General Settings */}
        <div className="space-y-6 flex-1 lg:max-w-xl">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">{t('settings.general')}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />
                  {t('settings.language')}
                </label>
                <div className="relative">
                  <select
                    value={i18n.language}
                    onChange={(e) => i18n.changeLanguage(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none appearance-none cursor-pointer"
                  >
                    {availableLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName} ({lang.name})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bambu-gray pointer-events-none" />
                </div>
                <p className="text-xs text-bambu-gray mt-1">
                  {t('settings.languageDescription')}
                </p>
              </div>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  {t('settings.defaultView')}
                </label>
                <div className="relative">
                  <select
                    value={defaultView}
                    onChange={(e) => handleDefaultViewChange(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none appearance-none cursor-pointer"
                  >
                    {defaultNavItems.map((item) => (
                      <option key={item.id} value={item.to}>
                        {t(item.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bambu-gray pointer-events-none" />
                </div>
                <p className="text-xs text-bambu-gray mt-1">
                  {t('settings.defaultViewDescription')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-bambu-gray mb-1">
                    Date Format
                  </label>
                  <div className="relative">
                    <select
                      value={localSettings.date_format || 'system'}
                      onChange={(e) => updateSetting('date_format', e.target.value as 'system' | 'us' | 'eu' | 'iso')}
                      className="w-full px-3 py-2 pr-10 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="system">System Default</option>
                      <option value="us">US (MM/DD/YYYY)</option>
                      <option value="eu">EU (DD/MM/YYYY)</option>
                      <option value="iso">ISO (YYYY-MM-DD)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bambu-gray pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-bambu-gray mb-1">
                    Time Format
                  </label>
                  <div className="relative">
                    <select
                      value={localSettings.time_format || 'system'}
                      onChange={(e) => updateSetting('time_format', e.target.value as 'system' | '12h' | '24h')}
                      className="w-full px-3 py-2 pr-10 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="system">System Default</option>
                      <option value="12h">12-hour (3:30 PM)</option>
                      <option value="24h">24-hour (15:30)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bambu-gray pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Default Printer
                </label>
                <div className="relative">
                  <select
                    value={localSettings.default_printer_id ?? ''}
                    onChange={(e) => updateSetting('default_printer_id', e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 pr-10 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="">No default (ask each time)</option>
                    {printers?.map((printer) => (
                      <option key={printer.id} value={printer.id}>
                        {printer.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bambu-gray pointer-events-none" />
                </div>
                <p className="text-xs text-bambu-gray mt-1">
                  Pre-select this printer for uploads, reprints, and other operations.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Sidebar order</p>
                  <p className="text-sm text-bambu-gray">
                    Drag items in the sidebar to reorder. Reset to default order here.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResetSidebarOrder}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Appearance
              </h2>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dark Mode Settings */}
              <div className={`space-y-3 p-4 rounded-lg border ${mode === 'dark' ? 'border-bambu-green bg-bambu-green/5' : 'border-bambu-dark-tertiary'}`}>
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  Dark Mode
                  {mode === 'dark' && <span className="text-xs text-bambu-green">(active)</span>}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Background</label>
                    <select
                      value={darkBackground}
                      onChange={(e) => { setDarkBackground(e.target.value as DarkBackground); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="neutral">Neutral</option>
                      <option value="warm">Warm</option>
                      <option value="cool">Cool</option>
                      <option value="oled">OLED Black</option>
                      <option value="slate">Slate Blue</option>
                      <option value="forest">Forest Green</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Accent</label>
                    <select
                      value={darkAccent}
                      onChange={(e) => { setDarkAccent(e.target.value as ThemeAccent); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="green">Green</option>
                      <option value="teal">Teal</option>
                      <option value="blue">Blue</option>
                      <option value="orange">Orange</option>
                      <option value="purple">Purple</option>
                      <option value="red">Red</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Style</label>
                    <select
                      value={darkStyle}
                      onChange={(e) => { setDarkStyle(e.target.value as ThemeStyle); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="classic">Classic</option>
                      <option value="glow">Glow</option>
                      <option value="vibrant">Vibrant</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Light Mode Settings */}
              <div className={`space-y-3 p-4 rounded-lg border ${mode === 'light' ? 'border-bambu-green bg-bambu-green/5' : 'border-bambu-dark-tertiary'}`}>
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  Light Mode
                  {mode === 'light' && <span className="text-xs text-bambu-green">(active)</span>}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Background</label>
                    <select
                      value={lightBackground}
                      onChange={(e) => { setLightBackground(e.target.value as LightBackground); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="neutral">Neutral</option>
                      <option value="warm">Warm</option>
                      <option value="cool">Cool</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Accent</label>
                    <select
                      value={lightAccent}
                      onChange={(e) => { setLightAccent(e.target.value as ThemeAccent); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="green">Green</option>
                      <option value="teal">Teal</option>
                      <option value="blue">Blue</option>
                      <option value="orange">Orange</option>
                      <option value="purple">Purple</option>
                      <option value="red">Red</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-bambu-gray mb-1">Style</label>
                    <select
                      value={lightStyle}
                      onChange={(e) => { setLightStyle(e.target.value as ThemeStyle); showToast('Settings saved', 'success'); }}
                      className="w-full px-2 py-1.5 text-sm bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    >
                      <option value="classic">Classic</option>
                      <option value="glow">Glow</option>
                      <option value="vibrant">Vibrant</option>
                    </select>
                  </div>
                </div>
              </div>

              <p className="text-xs text-bambu-gray">
                Toggle between dark and light mode using the sun/moon icon in the sidebar.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">Archive Settings</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Auto-archive prints</p>
                  <p className="text-sm text-bambu-gray">
                    Automatically save 3MF files when prints complete
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.auto_archive}
                    onChange={(e) => updateSetting('auto_archive', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Save thumbnails</p>
                  <p className="text-sm text-bambu-gray">
                    Extract and save preview images from 3MF files
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.save_thumbnails}
                    onChange={(e) => updateSetting('save_thumbnails', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Capture finish photo</p>
                  <p className="text-sm text-bambu-gray">
                    Take a photo from printer camera when print completes
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.capture_finish_photo}
                    onChange={(e) => updateSetting('capture_finish_photo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>
              {localSettings.capture_finish_photo && ffmpegStatus && !ffmpegStatus.installed && (
                <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-yellow-500 font-medium">ffmpeg not installed</p>
                    <p className="text-bambu-gray mt-1">
                      Camera capture requires ffmpeg. Install it via{' '}
                      <code className="bg-bambu-dark-tertiary px-1 rounded">brew install ffmpeg</code> (macOS) or{' '}
                      <code className="bg-bambu-dark-tertiary px-1 rounded">apt install ffmpeg</code> (Linux).
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Second Column - Camera, Cost, AMS & Spoolman */}
        <div className="space-y-6 flex-1 lg:max-w-md">
          {/* Camera Settings */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-bambu-green" />
                Camera
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Camera View Mode
                </label>
                <select
                  value={localSettings.camera_view_mode ?? 'window'}
                  onChange={(e) => updateSetting('camera_view_mode', e.target.value as 'window' | 'embedded')}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                >
                  <option value="window">New Window</option>
                  <option value="embedded">Embedded Overlay</option>
                </select>
                <p className="text-xs text-bambu-gray mt-1">
                  {localSettings.camera_view_mode === 'embedded'
                    ? 'Camera opens in a resizable overlay on the main screen'
                    : 'Camera opens in a separate browser window'}
                </p>
              </div>

              {/* External Cameras Section */}
              <div className="border-t border-bambu-dark-tertiary pt-4 mt-4">
                <h3 className="text-sm font-medium text-white mb-2">External Cameras</h3>
                <p className="text-xs text-bambu-gray mb-3">
                  Configure external cameras to replace the built-in printer camera. Supports MJPEG streams, RTSP, HTTP snapshots, and USB cameras (V4L2). When enabled, the external camera is used for live view and finish photos.
                </p>

                {printers && printers.length > 0 ? (
                  <div className="space-y-3">
                    {printers.map(printer => (
                      <div key={printer.id} className="p-3 bg-bambu-dark rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-medium text-sm">{printer.name}</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={printer.external_camera_enabled}
                              onChange={(e) => handleUpdatePrinterCamera(printer.id, { enabled: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-bambu-green"></div>
                          </label>
                        </div>

                        {printer.external_camera_enabled && (
                          <div className="space-y-2 mt-2">
                            <input
                              type="text"
                              placeholder={printer.external_camera_type === 'usb' ? 'Device path (/dev/video0)' : 'Camera URL (rtsp://... or http://...)'}
                              value={localCameraUrls[printer.id] ?? printer.external_camera_url ?? ''}
                              onChange={(e) => handleCameraUrlChange(printer.id, e.target.value)}
                              className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded text-white text-sm focus:border-bambu-green focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <select
                                value={printer.external_camera_type || 'mjpeg'}
                                onChange={(e) => handleUpdatePrinterCamera(printer.id, { type: e.target.value })}
                                className="flex-1 px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded text-white text-sm focus:border-bambu-green focus:outline-none"
                              >
                                <option value="mjpeg">MJPEG Stream</option>
                                <option value="rtsp">RTSP Stream</option>
                                <option value="snapshot">HTTP Snapshot</option>
                                <option value="usb">USB Camera (V4L2)</option>
                              </select>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleTestExternalCamera(printer.id, localCameraUrls[printer.id] ?? printer.external_camera_url ?? '', printer.external_camera_type || 'mjpeg')}
                                disabled={extCameraTestLoading[printer.id] || !(localCameraUrls[printer.id] ?? printer.external_camera_url)}
                              >
                                {extCameraTestLoading[printer.id] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Test'
                                )}
                              </Button>
                            </div>
                            {extCameraTestResults[printer.id] && (
                              <div className={`text-xs flex items-center gap-1 ${extCameraTestResults[printer.id]?.success ? 'text-green-500' : 'text-red-500'}`}>
                                {extCameraTestResults[printer.id]?.success ? (
                                  <>
                                    <CheckCircle className="w-3 h-3" />
                                    Connected{extCameraTestResults[printer.id]?.resolution && ` (${extCameraTestResults[printer.id]?.resolution})`}
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3 h-3" />
                                    {extCameraTestResults[printer.id]?.error || 'Connection failed'}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-bambu-gray italic">No printers configured</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">Cost Tracking</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Default filament cost (per kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={localSettings.default_filament_cost}
                  onChange={(e) =>
                    updateSetting('default_filament_cost', parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">Currency</label>
                <select
                  value={localSettings.currency}
                  onChange={(e) => updateSetting('currency', e.target.value)}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CHF">CHF (Fr.)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CNY">CNY (¥)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Electricity cost per kWh
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={localSettings.energy_cost_per_kwh}
                  onChange={(e) =>
                    updateSetting('energy_cost_per_kwh', parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Energy display mode
                </label>
                <select
                  value={localSettings.energy_tracking_mode || 'total'}
                  onChange={(e) => updateSetting('energy_tracking_mode', e.target.value as 'print' | 'total')}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                >
                  <option value="print">Prints Only</option>
                  <option value="total">Total Consumption</option>
                </select>
                <p className="text-xs text-bambu-gray mt-1">
                  {localSettings.energy_tracking_mode === 'print'
                    ? 'Dashboard shows sum of energy used during prints'
                    : 'Dashboard shows lifetime energy from smart plugs'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File Manager Settings */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-bambu-green" />
                File Manager
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Archive Mode */}
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Create Archive Entry When Printing
                </label>
                <select
                  value={localSettings.library_archive_mode ?? 'ask'}
                  onChange={(e) => updateSetting('library_archive_mode', e.target.value as 'always' | 'never' | 'ask')}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                >
                  <option value="always">Always create archive entry</option>
                  <option value="never">Never create archive entry</option>
                  <option value="ask">Ask each time</option>
                </select>
                <p className="text-xs text-bambu-gray mt-1">
                  When printing from File Manager, optionally create an archive entry
                </p>
              </div>

              {/* Disk Space Warning Threshold */}
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Low Disk Space Warning
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.5"
                    max="100"
                    step="0.5"
                    value={localSettings.library_disk_warning_gb ?? 5}
                    onChange={(e) => updateSetting('library_disk_warning_gb', parseFloat(e.target.value) || 5)}
                    className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                  />
                  <span className="text-bambu-gray">GB</span>
                </div>
                <p className="text-xs text-bambu-gray mt-1">
                  Show warning when free disk space falls below this threshold
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Third Column - Sidebar Links & Updates */}
        <div className="space-y-6 flex-1 lg:max-w-sm">
          {/* Sidebar Links */}
          <ExternalLinksSettings />

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">Updates</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Check for updates</p>
                  <p className="text-sm text-bambu-gray">
                    Automatically check for new versions on startup
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.check_updates}
                    onChange={(e) => updateSetting('check_updates', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Check printer firmware</p>
                  <p className="text-sm text-bambu-gray">
                    Check for printer firmware updates from Bambu Lab
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.check_printer_firmware ?? true}
                    onChange={(e) => updateSetting('check_printer_firmware', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>
              <div className="border-t border-bambu-dark-tertiary pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white">Current version</p>
                    <p className="text-sm text-bambu-gray">v{versionInfo?.version || '...'}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => refetchUpdateCheck()}
                    disabled={isCheckingUpdate}
                  >
                    {isCheckingUpdate ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Check now
                  </Button>
                </div>

                {updateCheck?.update_available ? (
                  <div className="mt-4 p-3 bg-bambu-green/10 border border-bambu-green/30 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-bambu-green font-medium">
                          Update available: v{updateCheck.latest_version}
                        </p>
                        {updateCheck.release_name && updateCheck.release_name !== updateCheck.latest_version && (
                          <p className="text-sm text-bambu-gray mt-1">{updateCheck.release_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {updateCheck.release_notes && (
                          <button
                            onClick={() => setShowReleaseNotes(true)}
                            className="text-bambu-gray hover:text-white transition-colors text-sm underline"
                          >
                            Release Notes
                          </button>
                        )}
                        {updateCheck.release_url && (
                          <a
                            href={updateCheck.release_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-bambu-gray hover:text-white transition-colors"
                            title="View release on GitHub"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {updateStatus?.status === 'downloading' || updateStatus?.status === 'installing' ? (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 text-sm text-bambu-gray">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{updateStatus.message}</span>
                        </div>
                        <div className="mt-2 w-full bg-bambu-dark-tertiary rounded-full h-2">
                          <div
                            className="bg-bambu-green h-2 rounded-full transition-all duration-300"
                            style={{ width: `${updateStatus.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : updateStatus?.status === 'complete' ? (
                      <div className="mt-3 p-2 bg-bambu-green/20 rounded text-sm text-bambu-green">
                        {updateStatus.message}
                      </div>
                    ) : updateStatus?.status === 'error' ? (
                      <div className="mt-3 p-2 bg-red-500/20 rounded text-sm text-red-400">
                        {updateStatus.error || updateStatus.message}
                      </div>
                    ) : updateCheck?.is_docker ? (
                      <div className="mt-3 p-3 bg-bambu-dark-tertiary rounded-lg">
                        <p className="text-sm text-bambu-gray mb-2">
                          Update via Docker Compose:
                        </p>
                        <code className="block text-xs bg-bambu-dark p-2 rounded text-bambu-green font-mono">
                          docker compose pull && docker compose up -d
                        </code>
                      </div>
                    ) : (
                      <Button
                        className="mt-3"
                        onClick={() => applyUpdateMutation.mutate()}
                        disabled={applyUpdateMutation.isPending}
                      >
                        {applyUpdateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Install Update
                      </Button>
                    )}
                  </div>
                ) : updateCheck?.error ? (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    Failed to check for updates: {updateCheck.error}
                  </div>
                ) : updateCheck && !updateCheck.update_available ? (
                  <p className="mt-2 text-sm text-bambu-gray">
                    You're running the latest version
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white">Data Management</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Clear Notification Logs</p>
                  <p className="text-sm text-bambu-gray">
                    Delete notification logs older than 30 days
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowClearLogsConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Reset UI Preferences</p>
                  <p className="text-sm text-bambu-gray">
                    Reset sidebar order, theme, view modes, and layout preferences. Printers, archives, and settings are not affected.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowClearStorageConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Reset
                </Button>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-bambu-dark-tertiary">
                <div>
                  <p className="text-white">Backup & Restore</p>
                  <p className="text-sm text-bambu-gray">
                    Export/import settings and configure GitHub backup
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTabChange('backup')}
                >
                  <Database className="w-4 h-4" />
                  Go to Backup
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* Network Tab */}
      {activeTab === 'network' && localSettings && (
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - External URL & FTP Retry */}
        <div className="flex-1 lg:max-w-xl space-y-4">
          {/* External URL */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                External URL
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-bambu-gray">
                The external URL where Bambuddy is accessible. Used for notification images and external integrations.
              </p>
              <div>
                <label className="block text-sm text-bambu-gray mb-1">
                  Bambuddy URL
                </label>
                <input
                  type="text"
                  value={localSettings.external_url ?? ''}
                  onChange={(e) => updateSetting('external_url', e.target.value)}
                  placeholder="http://192.168.1.100:8000"
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                />
                <p className="text-xs text-bambu-gray mt-1">
                  Include protocol and port (e.g., http://192.168.1.100:8000)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-400" />
                FTP Retry
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-bambu-gray">
                Retry FTP operations when printer WiFi is unreliable. Applies to 3MF downloads, print uploads, timelapse downloads, and firmware updates.
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Enable retry</p>
                  <p className="text-sm text-bambu-gray">
                    Automatically retry failed FTP operations
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.ftp_retry_enabled ?? true}
                    onChange={(e) => updateSetting('ftp_retry_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>

              {localSettings.ftp_retry_enabled && (
                <div className="space-y-4 pt-2 border-t border-bambu-dark-tertiary">
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Retry attempts
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={localSettings.ftp_retry_count ?? 3}
                        onChange={(e) => updateSetting('ftp_retry_count', Math.min(10, Math.max(1, parseInt(e.target.value) || 3)))}
                        className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                      />
                      <span className="text-bambu-gray">times</span>
                    </div>
                    <p className="text-xs text-bambu-gray mt-1">
                      Number of retry attempts before giving up (1-10)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Retry delay
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={localSettings.ftp_retry_delay ?? 2}
                        onChange={(e) => updateSetting('ftp_retry_delay', Math.min(30, Math.max(1, parseInt(e.target.value) || 2)))}
                        className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                      />
                      <span className="text-bambu-gray">seconds</span>
                    </div>
                    <p className="text-xs text-bambu-gray mt-1">
                      Wait time between retries (1-30)
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-bambu-dark-tertiary">
                <label className="block text-sm text-bambu-gray mb-1">
                  Connection timeout
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={localSettings.ftp_timeout ?? 30}
                    onChange={(e) => updateSetting('ftp_timeout', Math.min(120, Math.max(10, parseInt(e.target.value) || 30)))}
                    className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                  />
                  <span className="text-bambu-gray">seconds</span>
                </div>
                <p className="text-xs text-bambu-gray mt-1">
                  Socket timeout for slow connections. Increase for A1/A1 Mini printers with weak WiFi (10-120)
                </p>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Home Assistant & MQTT Publishing */}
        <div className="flex-1 lg:max-w-xl space-y-4">
          {/* Home Assistant Integration */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Home className="w-5 h-5 text-bambu-green" />
                  Home Assistant
                </h2>
                {localSettings.ha_enabled && haTestResult && (
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${haTestResult.success ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className={`text-sm ${haTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {haTestResult.success ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-bambu-gray">
                Connect to Home Assistant to control smart plugs via HA's REST API. Supports switch, light, input_boolean, and script entities.
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Enable Home Assistant</p>
                  <p className="text-xs text-bambu-gray">Control smart plugs via Home Assistant</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.ha_enabled ?? false}
                    onChange={(e) => updateSetting('ha_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>

              {localSettings.ha_enabled && (
                <>
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Home Assistant URL
                    </label>
                    <input
                      type="text"
                      value={localSettings.ha_url ?? ''}
                      onChange={(e) => updateSetting('ha_url', e.target.value)}
                      placeholder="http://192.168.1.100:8123"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Long-Lived Access Token
                    </label>
                    <input
                      type="password"
                      value={localSettings.ha_token ?? ''}
                      onChange={(e) => updateSetting('ha_token', e.target.value)}
                      placeholder="eyJ0eXAiOiJKV1QiLC..."
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                    <p className="text-xs text-bambu-gray mt-1">
                      Create a token in HA: Profile → Long-Lived Access Tokens → Create Token
                    </p>
                  </div>

                  {localSettings.ha_url && localSettings.ha_token && (
                    <div className="pt-2 border-t border-bambu-dark-tertiary">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={haTestLoading}
                        onClick={async () => {
                          setHaTestLoading(true);
                          setHaTestResult(null);
                          try {
                            const result = await api.testHAConnection(localSettings.ha_url!, localSettings.ha_token!);
                            setHaTestResult(result);
                          } catch (e) {
                            setHaTestResult({ success: false, message: null, error: e instanceof Error ? e.message : 'Unknown error' });
                          } finally {
                            setHaTestLoading(false);
                          }
                        }}
                      >
                        {haTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        Test Connection
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* MQTT Publishing */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-blue-400" />
                  MQTT Publishing
                </h2>
                {mqttStatus?.enabled && (
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${mqttStatus.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className={`text-sm ${mqttStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                      {mqttStatus.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-bambu-gray">
                Publish BamBuddy events to an external MQTT broker for integration with Node-RED, Home Assistant, and other automation systems.
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Enable MQTT</p>
                  <p className="text-sm text-bambu-gray">
                    Publish events to external MQTT broker
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.mqtt_enabled ?? false}
                    onChange={(e) => updateSetting('mqtt_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>

              {localSettings.mqtt_enabled && (
                <div className="space-y-4 pt-2 border-t border-bambu-dark-tertiary">
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Broker hostname
                    </label>
                    <input
                      type="text"
                      value={localSettings.mqtt_broker ?? ''}
                      onChange={(e) => updateSetting('mqtt_broker', e.target.value)}
                      placeholder="mqtt.example.com or 192.168.1.100"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                  </div>

                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-bambu-gray mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={localSettings.mqtt_port ?? 1883}
                        onChange={(e) => updateSetting('mqtt_port', Math.min(65535, Math.max(1, parseInt(e.target.value) || 1883)))}
                        className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3 pb-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localSettings.mqtt_use_tls ?? false}
                          onChange={(e) => {
                            const useTls = e.target.checked;
                            updateSetting('mqtt_use_tls', useTls);
                            // Auto-populate port based on TLS selection
                            const currentPort = localSettings.mqtt_port ?? 1883;
                            if (useTls && currentPort === 1883) {
                              updateSetting('mqtt_port', 8883);
                            } else if (!useTls && currentPort === 8883) {
                              updateSetting('mqtt_port', 1883);
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                      </label>
                      <span className="text-white text-sm">Use TLS</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Username (optional)
                    </label>
                    <input
                      type="text"
                      value={localSettings.mqtt_username ?? ''}
                      onChange={(e) => updateSetting('mqtt_username', e.target.value)}
                      placeholder="Leave empty for anonymous"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Password (optional)
                    </label>
                    <input
                      type="password"
                      value={localSettings.mqtt_password ?? ''}
                      onChange={(e) => updateSetting('mqtt_password', e.target.value)}
                      placeholder="Leave empty for anonymous"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Topic prefix
                    </label>
                    <input
                      type="text"
                      value={localSettings.mqtt_topic_prefix ?? 'bambuddy'}
                      onChange={(e) => updateSetting('mqtt_topic_prefix', e.target.value)}
                      placeholder="bambuddy"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                    <p className="text-xs text-bambu-gray mt-1">
                      Topics will be: {localSettings.mqtt_topic_prefix || 'bambuddy'}/printers/&lt;serial&gt;/status, etc.
                    </p>
                  </div>

                  {/* Connection Info */}
                  {mqttStatus && (
                    <div className="pt-3 mt-3 border-t border-bambu-dark-tertiary">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`w-2 h-2 rounded-full ${mqttStatus.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-bambu-gray">
                          {mqttStatus.connected ? (
                            <>Connected to <span className="text-white">{mqttStatus.broker}:{mqttStatus.port}</span></>
                          ) : (
                            'Not connected'
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Third Column - Prometheus Metrics */}
        <div className="flex-1 lg:max-w-md space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                Prometheus Metrics
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-bambu-gray">
                Expose printer metrics at <code className="bg-bambu-dark px-1 rounded">/api/v1/metrics</code> for Prometheus/Grafana monitoring.
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Enable Metrics Endpoint</p>
                  <p className="text-xs text-bambu-gray">Expose printer data in Prometheus format</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.prometheus_enabled ?? false}
                    onChange={(e) => updateSetting('prometheus_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                </label>
              </div>

              {localSettings.prometheus_enabled && (
                <div className="space-y-4 pt-2 border-t border-bambu-dark-tertiary">
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Bearer Token (optional)
                    </label>
                    <input
                      type="password"
                      value={localSettings.prometheus_token ?? ''}
                      onChange={(e) => updateSetting('prometheus_token', e.target.value)}
                      placeholder="Leave empty for no authentication"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                    <p className="text-xs text-bambu-gray mt-1">
                      If set, requests must include <code className="bg-bambu-dark px-1 rounded">Authorization: Bearer &lt;token&gt;</code>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-bambu-dark-tertiary">
                    <p className="text-sm text-white mb-2">Available Metrics</p>
                    <div className="text-xs text-bambu-gray space-y-1">
                      <p><code className="text-orange-400">bambuddy_printer_connected</code> - Connection status</p>
                      <p><code className="text-orange-400">bambuddy_printer_state</code> - Printer state (idle/printing/etc)</p>
                      <p><code className="text-orange-400">bambuddy_print_progress</code> - Print progress 0-100%</p>
                      <p><code className="text-orange-400">bambuddy_bed_temp_celsius</code> - Bed temperature</p>
                      <p><code className="text-orange-400">bambuddy_nozzle_temp_celsius</code> - Nozzle temperature</p>
                      <p><code className="text-orange-400">bambuddy_prints_total</code> - Total prints by result</p>
                      <p className="text-bambu-gray/70 italic">...and more (layers, fans, queue, filament usage)</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* Home Assistant Test Connection Modal */}
      {haTestResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bambu-dark-secondary rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              {haTestResult.success ? (
                <CheckCircle className="w-8 h-8 text-green-400" />
              ) : (
                <XCircle className="w-8 h-8 text-red-400" />
              )}
              <h3 className="text-lg font-medium text-white">
                {haTestResult.success ? 'Connection Successful' : 'Connection Failed'}
              </h3>
            </div>
            <p className="text-bambu-gray mb-6">
              {haTestResult.success
                ? haTestResult.message || 'Successfully connected to Home Assistant.'
                : haTestResult.error || 'Failed to connect to Home Assistant.'}
            </p>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => setHaTestResult(null)}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Plugs Tab */}
      {activeTab === 'plugs' && (
        <div className="max-w-4xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Plug className="w-5 h-5 text-bambu-green" />
                Smart Plugs
              </h2>
              <p className="text-sm text-bambu-gray mt-1">
                Connect smart plugs (Tasmota or Home Assistant) to automate power control and track energy usage for your printers.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 shrink-0">
              {smartPlugs && smartPlugs.filter(p => p.enabled).length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setShowBulkPlugConfirm('on')}
                    disabled={bulkPlugActionMutation.isPending}
                    title="Turn all plugs on"
                  >
                    {bulkPlugActionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Power className="w-4 h-4 text-bambu-green" />
                    )}
                    All On
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setShowBulkPlugConfirm('off')}
                    disabled={bulkPlugActionMutation.isPending}
                    title="Turn all plugs off"
                  >
                    {bulkPlugActionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PowerOff className="w-4 h-4 text-red-400" />
                    )}
                    All Off
                  </Button>
                </>
              )}
              <Button
                className="whitespace-nowrap"
                onClick={() => {
                  setEditingPlug(null);
                  setShowPlugModal(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Smart Plug
              </Button>
            </div>
          </div>

          {/* Energy Summary Card */}
          {smartPlugs && smartPlugs.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  Energy Summary
                  {energyLoading && (
                    <Loader2 className="w-4 h-4 animate-spin text-bambu-gray ml-2" />
                  )}
                </h3>
              </CardHeader>
              <CardContent>
                {plugEnergySummary ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Current Power */}
                    <div className="bg-bambu-dark rounded-lg p-3">
                      <div className="flex items-center gap-2 text-bambu-gray text-xs mb-1">
                        <Zap className="w-3 h-3" />
                        Current Power
                      </div>
                      <div className="text-xl font-bold text-white">
                        {plugEnergySummary.totalPower.toFixed(1)}
                        <span className="text-sm font-normal text-bambu-gray ml-1">W</span>
                      </div>
                      <div className="text-xs text-bambu-gray mt-1">
                        {plugEnergySummary.reachableCount}/{plugEnergySummary.totalPlugs} plugs online
                      </div>
                    </div>

                    {/* Today */}
                    <div className="bg-bambu-dark rounded-lg p-3">
                      <div className="flex items-center gap-2 text-bambu-gray text-xs mb-1">
                        <Calendar className="w-3 h-3" />
                        Today
                      </div>
                      <div className="text-xl font-bold text-white">
                        {plugEnergySummary.totalToday.toFixed(2)}
                        <span className="text-sm font-normal text-bambu-gray ml-1">kWh</span>
                      </div>
                      {localSettings && localSettings.energy_cost_per_kwh > 0 && (
                        <div className="text-xs text-bambu-gray mt-1">
                          ~{(plugEnergySummary.totalToday * localSettings.energy_cost_per_kwh).toFixed(2)} {localSettings.currency}
                        </div>
                      )}
                    </div>

                    {/* Yesterday */}
                    <div className="bg-bambu-dark rounded-lg p-3">
                      <div className="flex items-center gap-2 text-bambu-gray text-xs mb-1">
                        <TrendingUp className="w-3 h-3" />
                        Yesterday
                      </div>
                      <div className="text-xl font-bold text-white">
                        {plugEnergySummary.totalYesterday.toFixed(2)}
                        <span className="text-sm font-normal text-bambu-gray ml-1">kWh</span>
                      </div>
                      {localSettings && localSettings.energy_cost_per_kwh > 0 && (
                        <div className="text-xs text-bambu-gray mt-1">
                          ~{(plugEnergySummary.totalYesterday * localSettings.energy_cost_per_kwh).toFixed(2)} {localSettings.currency}
                        </div>
                      )}
                    </div>

                    {/* Total Lifetime */}
                    <div className="bg-bambu-dark rounded-lg p-3">
                      <div className="flex items-center gap-2 text-bambu-gray text-xs mb-1">
                        <DollarSign className="w-3 h-3" />
                        Total
                      </div>
                      <div className="text-xl font-bold text-white">
                        {plugEnergySummary.totalLifetime.toFixed(1)}
                        <span className="text-sm font-normal text-bambu-gray ml-1">kWh</span>
                      </div>
                      {localSettings && localSettings.energy_cost_per_kwh > 0 && (
                        <div className="text-xs text-bambu-gray mt-1">
                          ~{(plugEnergySummary.totalLifetime * localSettings.energy_cost_per_kwh).toFixed(2)} {localSettings.currency}
                        </div>
                      )}
                    </div>
                  </div>
                ) : !energyLoading ? (
                  <p className="text-sm text-bambu-gray">
                    Enable plugs to see energy summary
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {plugsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-bambu-green animate-spin" />
            </div>
          ) : smartPlugs && smartPlugs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {smartPlugs.map((plug) => (
                <SmartPlugCard
                  key={plug.id}
                  plug={plug}
                  onEdit={(p) => {
                    setEditingPlug(p);
                    setShowPlugModal(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-bambu-gray">
                  <Plug className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium text-white mb-2">No smart plugs configured</p>
                  <p className="text-sm mb-4">Add a Tasmota-based smart plug to track energy usage and automate power control.</p>
                  <Button
                    onClick={() => {
                      setEditingPlug(null);
                      setShowPlugModal(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Add Your First Smart Plug
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Providers */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-bambu-green" />
                Providers
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowLogViewer(true)}
                >
                  <History className="w-4 h-4" />
                  Log
                </Button>
                {notificationProviders && notificationProviders.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTestAllResult(null);
                      testAllMutation.mutate();
                    }}
                    disabled={testAllMutation.isPending}
                  >
                    {testAllMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Test All
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingProvider(null);
                    setShowNotificationModal(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </div>

            {/* Notification Language Setting */}
            <Card className="mb-4">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">{t('settings.notificationLanguage')}</p>
                    <p className="text-xs text-bambu-gray">{t('settings.notificationLanguageDescription')}</p>
                  </div>
                  <select
                    value={localSettings.notification_language || 'en'}
                    onChange={(e) => updateSetting('notification_language', e.target.value)}
                    className="px-2 py-1.5 bg-bambu-dark border border-bambu-dark-tertiary rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-bambu-green"
                  >
                    {availableLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Test All Results */}
            {testAllResult && (
              <Card className="mb-4">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">Test Results</span>
                    <button
                      onClick={() => setTestAllResult(null)}
                      className="text-bambu-gray hover:text-white text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-sm mb-2">
                    <span className="flex items-center gap-1 text-bambu-green">
                      <CheckCircle className="w-4 h-4" />
                      {testAllResult.success} passed
                    </span>
                    {testAllResult.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle className="w-4 h-4" />
                        {testAllResult.failed} failed
                      </span>
                    )}
                  </div>
                  {testAllResult.results.filter(r => !r.success).length > 0 && (
                    <div className="space-y-1 mt-2 pt-2 border-t border-bambu-dark-tertiary">
                      {testAllResult.results.filter(r => !r.success).map((result) => (
                        <div key={result.provider_id} className="text-xs text-red-400">
                          <span className="font-medium">{result.provider_name}:</span> {result.message}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {providersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-bambu-green animate-spin" />
              </div>
            ) : notificationProviders && notificationProviders.length > 0 ? (
              <div className="space-y-3">
                {notificationProviders.map((provider) => (
                  <NotificationProviderCard
                    key={provider.id}
                    provider={provider}
                    onEdit={(p) => {
                      setEditingProvider(p);
                      setShowNotificationModal(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-bambu-gray">
                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium text-white mb-2">No providers configured</p>
                    <p className="text-xs mb-3">Add a provider to receive alerts.</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingProvider(null);
                        setShowNotificationModal(true);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Add Provider
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Templates */}
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-bambu-green" />
              Message Templates
            </h2>
            <p className="text-sm text-bambu-gray mb-4">
              Customize notification messages for each event.
            </p>

            {templatesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-bambu-green animate-spin" />
              </div>
            ) : notificationTemplates && notificationTemplates.length > 0 ? (
              <div className="space-y-2">
                {notificationTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="cursor-pointer hover:border-bambu-green/50 transition-colors"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <CardContent className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-medium text-sm truncate">{template.name}</p>
                          <p className="text-bambu-gray text-xs truncate mt-0.5">
                            {template.title_template}
                          </p>
                        </div>
                        <button
                          className="p-1.5 hover:bg-bambu-dark-tertiary rounded transition-colors shrink-0 ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplate(template);
                          }}
                        >
                          <Edit2 className="w-4 h-4 text-bambu-gray" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-bambu-gray">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No templates available. Restart the backend to seed default templates.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'apikeys' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left Column - API Keys Management */}
          <div>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-bambu-green" />
                  API Keys
                </h2>
                <p className="text-sm text-bambu-gray mt-1">
                  Create API keys for external integrations and webhooks.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowCreateAPIKey(true)} className="flex-shrink-0">
                <Plus className="w-4 h-4" />
                Create Key
              </Button>
            </div>

            {/* Created Key Display */}
            {createdAPIKey && (
              <Card className="mb-6 border-bambu-green">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-bambu-green flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-white font-medium mb-1">API Key Created Successfully</p>
                      <p className="text-sm text-bambu-gray mb-2">
                        Copy this key now - it won't be shown again!
                      </p>
                      <div className="flex items-center gap-2 bg-bambu-dark rounded-lg p-2">
                        <code className="flex-1 text-sm text-bambu-green font-mono break-all">
                          {createdAPIKey}
                        </code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(createdAPIKey);
                              } else {
                                const textArea = document.createElement('textarea');
                                textArea.value = createdAPIKey;
                                textArea.style.position = 'fixed';
                                textArea.style.left = '-999999px';
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textArea);
                              }
                              showToast('Key copied to clipboard');
                            } catch {
                              showToast('Failed to copy key', 'error');
                            }
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setTestApiKey(createdAPIKey);
                            showToast('Key added to API Browser');
                          }}
                        >
                          Use in API Browser
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setCreatedAPIKey(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Create Key Form */}
            {showCreateAPIKey && (
              <Card className="mb-6">
                <CardHeader>
                  <h3 className="text-base font-semibold text-white">Create New API Key</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">Key Name</label>
                    <input
                      type="text"
                      value={newAPIKeyName}
                      onChange={(e) => setNewAPIKeyName(e.target.value)}
                      placeholder="e.g., Home Assistant, OctoPrint"
                      className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-bambu-gray mb-2">Permissions</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newAPIKeyPermissions.can_read_status}
                          onChange={(e) => setNewAPIKeyPermissions(prev => ({ ...prev, can_read_status: e.target.checked }))}
                          className="w-4 h-4 text-bambu-green rounded border-bambu-dark-tertiary bg-bambu-dark focus:ring-bambu-green"
                        />
                        <div>
                          <span className="text-white">Read Status</span>
                          <p className="text-xs text-bambu-gray">View printer status and queue</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newAPIKeyPermissions.can_queue}
                          onChange={(e) => setNewAPIKeyPermissions(prev => ({ ...prev, can_queue: e.target.checked }))}
                          className="w-4 h-4 text-bambu-green rounded border-bambu-dark-tertiary bg-bambu-dark focus:ring-bambu-green"
                        />
                        <div>
                          <span className="text-white">Manage Queue</span>
                          <p className="text-xs text-bambu-gray">Add and remove items from print queue</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newAPIKeyPermissions.can_control_printer}
                          onChange={(e) => setNewAPIKeyPermissions(prev => ({ ...prev, can_control_printer: e.target.checked }))}
                          className="w-4 h-4 text-bambu-green rounded border-bambu-dark-tertiary bg-bambu-dark focus:ring-bambu-green"
                        />
                        <div>
                          <span className="text-white">Control Printer</span>
                          <p className="text-xs text-bambu-gray">Pause, resume, and stop prints</p>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => createAPIKeyMutation.mutate({
                        name: newAPIKeyName || 'Unnamed Key',
                        ...newAPIKeyPermissions,
                      })}
                      disabled={createAPIKeyMutation.isPending}
                    >
                      {createAPIKeyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Create Key
                    </Button>
                    <Button variant="secondary" onClick={() => setShowCreateAPIKey(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Existing Keys List */}
            {apiKeysLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-bambu-green animate-spin" />
              </div>
            ) : apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <Card key={key.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Key className={`w-5 h-5 ${key.enabled ? 'text-bambu-green' : 'text-bambu-gray'}`} />
                          <div>
                            <p className="text-white font-medium">{key.name}</p>
                            <p className="text-xs text-bambu-gray">
                              {key.key_prefix}••••••••
                              {key.last_used && ` · Last used: ${formatDateOnly(key.last_used)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 text-xs">
                            {key.can_read_status && (
                              <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">Read</span>
                            )}
                            {key.can_queue && (
                              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Queue</span>
                            )}
                            {key.can_control_printer && (
                              <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">Control</span>
                            )}
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowDeleteAPIKeyConfirm(key.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-bambu-gray">
                    <Key className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium text-white mb-2">No API keys</p>
                    <p className="text-sm mb-4">Create an API key to integrate with external services.</p>
                    <Button onClick={() => setShowCreateAPIKey(true)}>
                      <Plus className="w-4 h-4" />
                      Create Your First Key
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Webhook Documentation */}
            <Card className="mt-6">
              <CardHeader>
                <h3 className="text-base font-semibold text-white">Webhook Endpoints</h3>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-bambu-gray">
                  Use your API key in the <code className="text-bambu-green">X-API-Key</code> header.
                </p>
                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-blue-400">GET</span>{' '}
                    <span className="text-white">/api/v1/webhook/status</span>
                    <span className="text-bambu-gray"> - Get all printer status</span>
                  </div>
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-blue-400">GET</span>{' '}
                    <span className="text-white">/api/v1/webhook/status/:id</span>
                    <span className="text-bambu-gray"> - Get specific printer status</span>
                  </div>
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-green-400">POST</span>{' '}
                    <span className="text-white">/api/v1/webhook/queue</span>
                    <span className="text-bambu-gray"> - Add to print queue</span>
                  </div>
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-orange-400">POST</span>{' '}
                    <span className="text-white">/api/v1/webhook/printer/:id/pause</span>
                    <span className="text-bambu-gray"> - Pause print</span>
                  </div>
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-orange-400">POST</span>{' '}
                    <span className="text-white">/api/v1/webhook/printer/:id/resume</span>
                    <span className="text-bambu-gray"> - Resume print</span>
                  </div>
                  <div className="p-2 bg-bambu-dark rounded">
                    <span className="text-red-400">POST</span>{' '}
                    <span className="text-white">/api/v1/webhook/printer/:id/stop</span>
                    <span className="text-bambu-gray"> - Stop print</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - API Browser */}
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-bambu-green" />
                API Browser
              </h2>
              <p className="text-sm text-bambu-gray mt-1">
                Explore and test all available API endpoints.
              </p>
            </div>

            {/* API Key Input for Testing */}
            <Card className="mb-4">
              <CardContent className="py-3">
                <label className="block text-sm text-bambu-gray mb-2">API Key for Testing</label>
                <input
                  type="text"
                  value={testApiKey}
                  onChange={(e) => setTestApiKey(e.target.value)}
                  placeholder="Paste your API key here to test authenticated endpoints..."
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white font-mono text-sm focus:border-bambu-green focus:outline-none"
                />
                <p className="text-xs text-bambu-gray mt-2">
                  This key will be sent as <code className="text-bambu-green">X-API-Key</code> header with requests.
                </p>
              </CardContent>
            </Card>

            <APIBrowser apiKey={testApiKey} />
          </div>
        </div>
      )}

      {/* Virtual Printer Tab */}
      {activeTab === 'virtual-printer' && (
        <VirtualPrinterSettings />
      )}

      {/* Filament Tab */}
      {activeTab === 'filament' && localSettings && (
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Left Column - AMS Display Thresholds */}
          <div className="flex-1 lg:max-w-xl">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-white">AMS Display Thresholds</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-bambu-gray">
                  Configure color thresholds for AMS humidity and temperature indicators.
                </p>

                {/* Humidity Thresholds */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white">
                    <Droplets className="w-4 h-4 text-blue-400" />
                    <span className="font-medium">Humidity</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-bambu-gray mb-1">
                        Good (green) ≤
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={localSettings.ams_humidity_good ?? 40}
                          onChange={(e) => updateSetting('ams_humidity_good', parseInt(e.target.value) || 40)}
                          className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                        />
                        <span className="text-bambu-gray">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-bambu-gray mb-1">
                        Fair (orange) ≤
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={localSettings.ams_humidity_fair ?? 60}
                          onChange={(e) => updateSetting('ams_humidity_fair', parseInt(e.target.value) || 60)}
                          className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                        />
                        <span className="text-bambu-gray">%</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-bambu-gray">
                    Above fair threshold shows as red (bad)
                  </p>
                </div>

                {/* Temperature Thresholds */}
                <div className="space-y-3 pt-2 border-t border-bambu-dark-tertiary">
                  <div className="flex items-center gap-2 text-white">
                    <Thermometer className="w-4 h-4 text-orange-400" />
                    <span className="font-medium">Temperature</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-bambu-gray mb-1">
                        Good (blue) ≤
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="60"
                          value={localSettings.ams_temp_good ?? 28}
                          onChange={(e) => updateSetting('ams_temp_good', parseFloat(e.target.value) || 28)}
                          className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                        />
                        <span className="text-bambu-gray">°C</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-bambu-gray mb-1">
                        Fair (orange) ≤
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="60"
                          value={localSettings.ams_temp_fair ?? 35}
                          onChange={(e) => updateSetting('ams_temp_fair', parseFloat(e.target.value) || 35)}
                          className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                        />
                        <span className="text-bambu-gray">°C</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-bambu-gray">
                    Above fair threshold shows as red (hot)
                  </p>
                </div>

                {/* History Retention */}
                <div className="space-y-3 pt-4 border-t border-bambu-dark-tertiary">
                  <div className="flex items-center gap-2 text-white">
                    <Database className="w-4 h-4 text-purple-400" />
                    <span className="font-medium">History Retention</span>
                  </div>
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1">
                      Keep sensor history for
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={localSettings.ams_history_retention_days ?? 30}
                        onChange={(e) => updateSetting('ams_history_retention_days', parseInt(e.target.value) || 30)}
                        className="w-24 px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                      />
                      <span className="text-bambu-gray">days</span>
                    </div>
                  </div>
                  <p className="text-xs text-bambu-gray">
                    Older humidity and temperature data will be automatically deleted
                  </p>
                </div>

                {/* Per-Printer Mapping Default */}
                <div className="space-y-3 pt-4 border-t border-bambu-dark-tertiary">
                  <div className="flex items-center gap-2 text-white">
                    <Printer className="w-4 h-4 text-bambu-green" />
                    <span className="font-medium">Print Modal</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm text-white">
                        Expand custom mapping by default
                      </label>
                      <p className="text-xs text-bambu-gray mt-0.5">
                        When printing to multiple printers, show per-printer AMS mapping expanded
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSettings.per_printer_mapping_expanded ?? false}
                        onChange={(e) => updateSetting('per_printer_mapping_expanded', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-bambu-dark-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bambu-green"></div>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Spoolman Integration */}
          <div className="flex-1 lg:max-w-xl">
            <SpoolmanSettings />
          </div>
        </div>
      )}

      {/* Delete API Key Confirmation */}
      {showDeleteAPIKeyConfirm !== null && (
        <ConfirmModal
          title="Delete API Key"
          message="Are you sure you want to delete this API key? Any integrations using this key will stop working."
          confirmText="Delete Key"
          variant="danger"
          onConfirm={() => {
            deleteAPIKeyMutation.mutate(showDeleteAPIKeyConfirm);
            setShowDeleteAPIKeyConfirm(null);
          }}
          onCancel={() => setShowDeleteAPIKeyConfirm(null)}
        />
      )}

      {/* Smart Plug Modal */}
      {showPlugModal && (
        <AddSmartPlugModal
          plug={editingPlug}
          onClose={() => {
            setShowPlugModal(false);
            setEditingPlug(null);
          }}
        />
      )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <AddNotificationModal
          provider={editingProvider}
          onClose={() => {
            setShowNotificationModal(false);
            setEditingProvider(null);
          }}
        />
      )}

      {/* Template Editor Modal */}
      {editingTemplate && (
        <NotificationTemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {/* Notification Log Viewer */}
      {showLogViewer && (
        <NotificationLogViewer
          onClose={() => setShowLogViewer(false)}
        />
      )}

      {/* Confirm Modal: Clear Notification Logs */}
      {showClearLogsConfirm && (
        <ConfirmModal
          title="Clear Notification Logs"
          message="This will permanently delete all notification logs older than 30 days. This action cannot be undone."
          confirmText="Clear Logs"
          variant="warning"
          onConfirm={async () => {
            setShowClearLogsConfirm(false);
            try {
              const result = await api.clearNotificationLogs(30);
              showToast(result.message, 'success');
            } catch {
              showToast('Failed to clear logs', 'error');
            }
          }}
          onCancel={() => setShowClearLogsConfirm(false)}
        />
      )}

      {/* Confirm Modal: Clear Local Storage */}
      {showClearStorageConfirm && (
        <ConfirmModal
          title="Reset UI Preferences"
          message="This will reset all UI preferences to defaults: sidebar order, theme, dashboard layout, view modes, and sorting preferences. Your printers, archives, and server settings will NOT be affected. The page will reload after clearing."
          confirmText="Reset Preferences"
          variant="default"
          onConfirm={() => {
            setShowClearStorageConfirm(false);
            localStorage.clear();
            showToast('UI preferences reset. Refreshing...', 'success');
            setTimeout(() => window.location.reload(), 1000);
          }}
          onCancel={() => setShowClearStorageConfirm(false)}
        />
      )}

      {/* Confirm Modal: Bulk Plug Action */}
      {showBulkPlugConfirm && (
        <ConfirmModal
          title={`Turn All Plugs ${showBulkPlugConfirm === 'on' ? 'On' : 'Off'}`}
          message={`This will turn ${showBulkPlugConfirm === 'on' ? 'ON' : 'OFF'} all ${smartPlugs?.filter(p => p.enabled).length || 0} enabled smart plugs. ${showBulkPlugConfirm === 'off' ? 'Any running printers may be affected!' : ''}`}
          confirmText={`Turn All ${showBulkPlugConfirm === 'on' ? 'On' : 'Off'}`}
          variant={showBulkPlugConfirm === 'off' ? 'danger' : 'warning'}
          onConfirm={() => {
            const action = showBulkPlugConfirm;
            setShowBulkPlugConfirm(null);
            bulkPlugActionMutation.mutate(action);
          }}
          onCancel={() => setShowBulkPlugConfirm(null)}
        />
      )}

      {/* Release Notes Modal */}
      {showReleaseNotes && updateCheck?.release_notes && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowReleaseNotes(false)}
        >
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Release Notes - v{updateCheck.latest_version}
                </h2>
                {updateCheck.release_name && updateCheck.release_name !== updateCheck.latest_version && (
                  <p className="text-sm text-bambu-gray">{updateCheck.release_name}</p>
                )}
              </div>
              <button
                onClick={() => setShowReleaseNotes(false)}
                className="p-1 rounded hover:bg-bambu-dark-tertiary text-bambu-gray hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-1">
              <pre className="text-sm text-bambu-gray whitespace-pre-wrap font-sans">
                {updateCheck.release_notes}
              </pre>
            </CardContent>
            <div className="p-4 border-t border-bambu-dark-tertiary shrink-0 flex gap-2">
              {updateCheck.release_url && (
                <a
                  href={updateCheck.release_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    <ExternalLink className="w-4 h-4" />
                    View on GitHub
                  </Button>
                </a>
              )}
              <Button
                onClick={() => setShowReleaseNotes(false)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Auth Toggle Header */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${authEnabled ? 'bg-green-500/20' : 'bg-gray-500/20'}`}>
                    {authEnabled ? (
                      <Lock className="w-5 h-5 text-green-400" />
                    ) : (
                      <Unlock className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Authentication</h3>
                    <p className="text-sm text-bambu-gray">
                      {authEnabled
                        ? 'Your instance is secured with user authentication'
                        : 'Enable to require login and manage user access'}
                    </p>
                  </div>
                </div>
                {!authEnabled ? (
                  <Button onClick={() => navigate('/setup')}>
                    <Lock className="w-4 h-4" />
                    Enable
                  </Button>
                ) : user?.is_admin && (
                  <Button variant="secondary" onClick={() => setShowDisableAuthConfirm(true)}>
                    <Unlock className="w-4 h-4" />
                    Disable
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {authEnabled && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left Column: Current User + User List */}
              <div className="space-y-6">
                {/* Current User Card */}
                {user && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Users className="w-5 h-5 text-bambu-green" />
                          Current User
                        </h3>
                        <Button size="sm" variant="ghost" onClick={() => setShowChangePasswordModal(true)}>
                          <Key className="w-4 h-4" />
                          Change Password
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium text-lg">{user.username}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {user.is_admin && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                                Admin
                              </span>
                            )}
                            {user.groups?.map(group => (
                              <span
                                key={group.id}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  group.name === 'Administrators'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : group.name === 'Operators'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : group.name === 'Viewers'
                                    ? 'bg-green-500/20 text-green-300'
                                    : 'bg-gray-500/20 text-gray-300'
                                }`}
                              >
                                {group.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* User List */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-bambu-green" />
                        Users
                      </h3>
                      {hasPermission('users:create') && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setShowCreateUserModal(true);
                            setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add User
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {usersLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-bambu-green animate-spin" />
                      </div>
                    ) : usersData.length === 0 ? (
                      <p className="text-center text-bambu-gray py-8">No users found</p>
                    ) : (
                      <div className="divide-y divide-bambu-dark-tertiary">
                        {usersData.map((userItem) => (
                          <div key={userItem.id} className="py-3 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{userItem.username}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {userItem.is_admin && (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                                    Admin
                                  </span>
                                )}
                                {userItem.groups?.map(group => (
                                  <span
                                    key={group.id}
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      group.name === 'Administrators'
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : group.name === 'Operators'
                                        ? 'bg-blue-500/20 text-blue-300'
                                        : group.name === 'Viewers'
                                        ? 'bg-green-500/20 text-green-300'
                                        : 'bg-gray-500/20 text-gray-300'
                                    }`}
                                  >
                                    {group.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                              {hasPermission('users:update') && (
                                <Button size="sm" variant="ghost" onClick={() => startEditUser(userItem)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              )}
                              {hasPermission('users:delete') && userItem.id !== user?.id && (
                                <Button size="sm" variant="ghost" onClick={() => setDeleteUserId(userItem.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Groups */}
              <div>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-bambu-green" />
                        Groups
                      </h3>
                      {hasPermission('groups:create') && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setShowCreateGroupModal(true);
                            resetGroupForm();
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add Group
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {groupsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-bambu-green animate-spin" />
                      </div>
                    ) : groupsData.length === 0 ? (
                      <p className="text-center text-bambu-gray py-8">No groups found</p>
                    ) : (
                      <div className="divide-y divide-bambu-dark-tertiary">
                        {groupsData.map((group) => (
                          <div key={group.id} className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Shield
                                  className={`w-4 h-4 ${
                                    group.name === 'Administrators'
                                      ? 'text-purple-400'
                                      : group.name === 'Operators'
                                      ? 'text-blue-400'
                                      : group.name === 'Viewers'
                                      ? 'text-green-400'
                                      : 'text-bambu-gray'
                                  }`}
                                />
                                <span className="text-white font-medium">{group.name}</span>
                                {group.is_system && (
                                  <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                                    System
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {hasPermission('groups:update') && (
                                  <Button size="sm" variant="ghost" onClick={() => startEditGroup(group)}>
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {hasPermission('groups:delete') && !group.is_system && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteGroupId(group.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-bambu-gray mt-1 ml-6">
                              {group.description || 'No description'}
                            </p>
                            <div className="flex items-center gap-4 mt-2 ml-6 text-xs text-bambu-gray">
                              <span>{group.user_count} users</span>
                              <span>{group.permissions.length} permissions</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Auth Disabled Info */}
          {!authEnabled && (
            <Card>
              <CardContent className="py-6">
                <div className="text-center">
                  <Unlock className="w-12 h-12 text-bambu-gray mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Authentication is Disabled</h3>
                  <p className="text-sm text-bambu-gray mb-4 max-w-md mx-auto">
                    Enable authentication to create user accounts, manage permissions, and secure your Bambuddy instance.
                  </p>
                  <ul className="space-y-2 text-sm text-bambu-gray mb-6 text-left max-w-xs mx-auto">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-bambu-green mt-0.5 flex-shrink-0" />
                      <span>Require login to access the system</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-bambu-green mt-0.5 flex-shrink-0" />
                      <span>Create multiple users with group-based permissions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-bambu-green mt-0.5 flex-shrink-0" />
                      <span>Control access with 50+ granular permissions</span>
                    </li>
                  </ul>
                  <Button onClick={() => navigate('/setup')}>
                    <Lock className="w-4 h-4" />
                    Enable Authentication
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <div
          className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCreateUserModal(false);
            setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
          }}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-bambu-green" />
                  <h2 className="text-lg font-semibold text-white">Create User</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Username</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Password</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter password (min 6 characters)"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={userFormData.confirmPassword}
                    onChange={(e) => setUserFormData({ ...userFormData, confirmPassword: e.target.value })}
                    className={`w-full px-4 py-3 bg-bambu-dark-secondary border rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors ${
                      userFormData.confirmPassword && userFormData.password !== userFormData.confirmPassword
                        ? 'border-red-500'
                        : 'border-bambu-dark-tertiary'
                    }`}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    minLength={6}
                  />
                  {userFormData.confirmPassword && userFormData.password !== userFormData.confirmPassword && (
                    <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Groups</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg">
                    {groupsData.map(group => (
                      <label
                        key={group.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-bambu-dark-tertiary cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={userFormData.group_ids.includes(group.id)}
                          onChange={() => toggleUserGroup(group.id)}
                          className="w-4 h-4 rounded border-bambu-gray text-bambu-green focus:ring-bambu-green focus:ring-offset-0 bg-bambu-dark"
                        />
                        <span className="text-sm text-white">{group.name}</span>
                        {group.is_system && (
                          <span className="text-xs text-yellow-400">(System)</span>
                        )}
                      </label>
                    ))}
                    {groupsData.length === 0 && (
                      <p className="text-sm text-bambu-gray">No groups available</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateUser}
                  disabled={createUserMutation.isPending || !userFormData.username || !userFormData.password || userFormData.password !== userFormData.confirmPassword || userFormData.password.length < 6}
                >
                  {createUserMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUserId !== null && (
        <div
          className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowEditUserModal(false);
            setEditingUserId(null);
            setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
          }}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-bambu-green" />
                  <h2 className="text-lg font-semibold text-white">Edit User</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUserId(null);
                    setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Username</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Password <span className="text-bambu-gray font-normal">(leave blank to keep current)</span>
                  </label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value, confirmPassword: '' })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                {userFormData.password && (
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Confirm Password</label>
                    <input
                      type="password"
                      value={userFormData.confirmPassword}
                      onChange={(e) => setUserFormData({ ...userFormData, confirmPassword: e.target.value })}
                      className={`w-full px-4 py-3 bg-bambu-dark-secondary border rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors ${
                        userFormData.confirmPassword && userFormData.password !== userFormData.confirmPassword
                          ? 'border-red-500'
                          : 'border-bambu-dark-tertiary'
                      }`}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      minLength={6}
                    />
                    {userFormData.confirmPassword && userFormData.password !== userFormData.confirmPassword && (
                      <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Groups</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg">
                    {groupsData.map(group => (
                      <label
                        key={group.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-bambu-dark-tertiary cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={userFormData.group_ids.includes(group.id)}
                          onChange={() => toggleUserGroup(group.id)}
                          className="w-4 h-4 rounded border-bambu-gray text-bambu-green focus:ring-bambu-green focus:ring-offset-0 bg-bambu-dark"
                        />
                        <span className="text-sm text-white">{group.name}</span>
                        {group.is_system && (
                          <span className="text-xs text-yellow-400">(System)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUserId(null);
                    setUserFormData({ username: '', password: '', confirmPassword: '', role: 'user', group_ids: [] });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleUpdateUser(editingUserId)}
                  disabled={updateUserMutation.isPending || !userFormData.username || !!(userFormData.password && (userFormData.password !== userFormData.confirmPassword || userFormData.password.length < 6))}
                >
                  {updateUserMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteUserId !== null && (
        <ConfirmModal
          title="Delete User"
          message="Are you sure you want to delete this user? This action cannot be undone."
          confirmText="Delete User"
          variant="danger"
          onConfirm={() => {
            deleteUserMutation.mutate(deleteUserId);
            setDeleteUserId(null);
          }}
          onCancel={() => setDeleteUserId(null)}
        />
      )}

      {/* Create/Edit Group Modal */}
      {(showCreateGroupModal || editingGroup) && (
        <div
          className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCreateGroupModal(false);
            setEditingGroup(null);
            resetGroupForm();
          }}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-bambu-green" />
                  <h2 className="text-lg font-semibold text-white">
                    {editingGroup ? 'Edit Group' : 'Create Group'}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setEditingGroup(null);
                    resetGroupForm();
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Group Name</label>
                  <input
                    type="text"
                    value={groupFormData.name}
                    onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                    disabled={editingGroup?.is_system}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors disabled:opacity-50"
                    placeholder="Enter group name"
                  />
                  {editingGroup?.is_system && (
                    <p className="text-xs text-yellow-400 mt-1">System group names cannot be changed</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Description</label>
                  <textarea
                    value={groupFormData.description}
                    onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors resize-none"
                    placeholder="Enter description (optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Permissions ({groupFormData.permissions.length} selected)
                  </label>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {permissionsData?.categories.map((category) => (
                      <div key={category.name} className="border border-bambu-dark-tertiary rounded-lg overflow-hidden">
                        <div
                          className="flex items-center justify-between px-4 py-2 bg-bambu-dark-secondary cursor-pointer hover:bg-bambu-dark-tertiary transition-colors"
                          onClick={() => toggleCategory(category.name)}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategoryPermissions(category, !isCategoryFullySelected(category));
                              }}
                              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isCategoryFullySelected(category)
                                  ? 'bg-bambu-green border-bambu-green'
                                  : isCategoryPartiallySelected(category)
                                  ? 'bg-bambu-green/50 border-bambu-green'
                                  : 'border-bambu-gray hover:border-white'
                              }`}
                            >
                              {(isCategoryFullySelected(category) || isCategoryPartiallySelected(category)) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </button>
                            <span className="text-white font-medium">{category.name}</span>
                            <span className="text-xs text-bambu-gray">
                              ({category.permissions.filter((p) => groupFormData.permissions.includes(p.value)).length}/
                              {category.permissions.length})
                            </span>
                          </div>
                          {expandedCategories.has(category.name) ? (
                            <ChevronDown className="w-4 h-4 text-bambu-gray" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-bambu-gray" />
                          )}
                        </div>
                        {expandedCategories.has(category.name) && (
                          <div className="p-3 bg-bambu-dark space-y-2">
                            {category.permissions.map((perm) => (
                              <label
                                key={perm.value}
                                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-bambu-dark-secondary cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={groupFormData.permissions.includes(perm.value)}
                                  onChange={() => togglePermission(perm.value)}
                                  className="w-4 h-4 rounded border-bambu-gray text-bambu-green focus:ring-bambu-green focus:ring-offset-0 bg-bambu-dark-secondary"
                                />
                                <span className="text-sm text-bambu-gray">{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setEditingGroup(null);
                    resetGroupForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                  disabled={createGroupMutation.isPending || updateGroupMutation.isPending || !groupFormData.name.trim()}
                >
                  {(createGroupMutation.isPending || updateGroupMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {editingGroup ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingGroup ? 'Save Changes' : 'Create Group'}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Group Confirmation Modal */}
      {deleteGroupId !== null && (
        <ConfirmModal
          title="Delete Group"
          message="Are you sure you want to delete this group? Users in this group will lose these permissions."
          confirmText="Delete Group"
          variant="danger"
          onConfirm={() => {
            deleteGroupMutation.mutate(deleteGroupId);
            setDeleteGroupId(null);
          }}
          onCancel={() => setDeleteGroupId(null)}
        />
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <GitHubBackupSettings />
      )}

      {/* Disable Authentication Confirmation Modal */}
      {showDisableAuthConfirm && (
        <ConfirmModal
          title="Disable Authentication"
          message="Are you sure you want to disable authentication? This will make your Bambuddy instance accessible without login. All users will remain in the database but authentication will be disabled."
          confirmText="Disable Authentication"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.disableAuth();
              showToast('Authentication disabled successfully', 'success');
              await refreshAuth();
              setShowDisableAuthConfirm(false);
              // Refresh the page to ensure all protected routes are accessible
              window.location.href = '/';
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Failed to disable authentication';
              showToast(message, 'error');
            }
          }}
          onCancel={() => setShowDisableAuthConfirm(false)}
        />
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowChangePasswordModal(false);
            setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
          }}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-bambu-green" />
                  <h2 className="text-lg font-semibold text-white">Change Password</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.currentPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, currentPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.newPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, newPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors"
                    placeholder="Enter new password (min 6 characters)"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={changePasswordData.confirmPassword}
                    onChange={(e) => setChangePasswordData({ ...changePasswordData, confirmPassword: e.target.value })}
                    className={`w-full px-4 py-3 bg-bambu-dark-secondary border rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green transition-colors ${
                      changePasswordData.confirmPassword && changePasswordData.newPassword !== changePasswordData.confirmPassword
                        ? 'border-red-500'
                        : 'border-bambu-dark-tertiary'
                    }`}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    minLength={6}
                  />
                  {changePasswordData.confirmPassword && changePasswordData.newPassword !== changePasswordData.confirmPassword && (
                    <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
                      showToast('Passwords do not match', 'error');
                      return;
                    }
                    if (changePasswordData.newPassword.length < 6) {
                      showToast('Password must be at least 6 characters', 'error');
                      return;
                    }
                    setChangePasswordLoading(true);
                    try {
                      await api.changePassword(changePasswordData.currentPassword, changePasswordData.newPassword);
                      showToast('Password changed successfully', 'success');
                      setShowChangePasswordModal(false);
                      setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    } catch (error: unknown) {
                      const message = error instanceof Error ? error.message : 'Failed to change password';
                      showToast(message, 'error');
                    } finally {
                      setChangePasswordLoading(false);
                    }
                  }}
                  disabled={changePasswordLoading || !changePasswordData.currentPassword || !changePasswordData.newPassword || changePasswordData.newPassword !== changePasswordData.confirmPassword || changePasswordData.newPassword.length < 6}
                >
                  {changePasswordLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      Change Password
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
