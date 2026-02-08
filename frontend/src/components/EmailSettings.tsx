import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Mail, Check, AlertCircle, Loader2, TestTube, Save, Lock, Unlock } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent, CardHeader } from './Card';
import { Button } from './Button';
import { Toggle } from './Toggle';

export function EmailSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState('');
  const [smtpFormData, setSmtpFormData] = useState({
    smtp_server: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_from_address: '',
    smtp_use_tls: true,
    smtp_use_ssl: false,
  });

  // Get SMTP settings
  const { data: smtpSettings, isLoading: smtpLoading } = useQuery({
    queryKey: ['smtp-settings'],
    queryFn: () => api.getSMTPSettings(),
  });

  // Get advanced auth status
  const { data: advancedAuthStatus } = useQuery({
    queryKey: ['advanced-auth-status'],
    queryFn: () => api.getAdvancedAuthStatus(),
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (smtpSettings && smtpSettings.configured) {
      setSmtpFormData({
        smtp_server: smtpSettings.smtp_server || '',
        smtp_port: smtpSettings.smtp_port || 587,
        smtp_username: smtpSettings.smtp_username || '',
        smtp_password: '', // Never pre-fill password
        smtp_from_address: smtpSettings.smtp_from_address || '',
        smtp_use_tls: smtpSettings.smtp_use_tls ?? true,
        smtp_use_ssl: smtpSettings.smtp_use_ssl ?? false,
      });
    }
  }, [smtpSettings]);

  // Save SMTP settings mutation
  const saveSMTPMutation = useMutation({
    mutationFn: () => api.updateSMTPSettings(smtpFormData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-settings'] });
      showToast('SMTP settings saved successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to save SMTP settings', 'error');
    },
  });

  // Test SMTP mutation
  const testSMTPMutation = useMutation({
    mutationFn: () => api.testSMTPSettings(testEmail),
    onSuccess: (data) => {
      if (data.success) {
        showToast(`Test email sent successfully to ${testEmail}`, 'success');
      } else {
        showToast(data.message || 'Failed to send test email', 'error');
      }
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to test SMTP settings', 'error');
    },
  });

  // Toggle advanced auth mutation
  const toggleAdvancedAuthMutation = useMutation({
    mutationFn: (enabled: boolean) => api.updateAdvancedAuthStatus(enabled),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['advanced-auth-status'] });
      showToast(data.message, 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to update advanced authentication', 'error');
    },
  });

  const handleSaveSMTP = () => {
    if (!smtpFormData.smtp_server || !smtpFormData.smtp_from_address) {
      showToast('SMTP server and from address are required', 'error');
      return;
    }
    saveSMTPMutation.mutate();
  };

  const handleTestSMTP = () => {
    if (!testEmail) {
      showToast('Please enter an email address to test', 'error');
      return;
    }
    testSMTPMutation.mutate();
  };

  const handleToggleAdvancedAuth = (enabled: boolean) => {
    if (enabled && (!smtpSettings || !smtpSettings.configured)) {
      showToast('Please configure SMTP settings before enabling advanced authentication', 'error');
      return;
    }
    toggleAdvancedAuthMutation.mutate(enabled);
  };

  if (smtpLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-bambu-green animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Advanced Authentication Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {advancedAuthStatus?.enabled ? (
                <Unlock className="w-5 h-5 text-bambu-green" />
              ) : (
                <Lock className="w-5 h-5 text-bambu-gray" />
              )}
              <h2 className="text-lg font-semibold text-white">Advanced Authentication</h2>
            </div>
            <Toggle
              checked={advancedAuthStatus?.enabled || false}
              onChange={handleToggleAdvancedAuth}
              disabled={toggleAdvancedAuthMutation.isPending}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-bambu-gray">
              When enabled, advanced authentication provides:
            </p>
            <ul className="list-disc list-inside text-sm text-bambu-gray space-y-1 ml-4">
              <li>Auto-generated passwords for new users</li>
              <li>Email notifications with login credentials</li>
              <li>Password reset via email</li>
              <li>Login with username or email address</li>
            </ul>
            {!smtpSettings?.configured && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-500">
                  SMTP settings must be configured and tested before enabling advanced authentication.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-bambu-green" />
            <h2 className="text-lg font-semibold text-white">SMTP Email Settings</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* SMTP Server */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  SMTP Server *
                </label>
                <input
                  type="text"
                  value={smtpFormData.smtp_server}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_server: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Port *
                </label>
                <input
                  type="number"
                  value={smtpFormData.smtp_port}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_port: parseInt(e.target.value) || 587 })}
                  placeholder="587"
                  className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
                />
              </div>
            </div>

            {/* Username and Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={smtpFormData.smtp_username}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_username: e.target.value })}
                  placeholder="your-email@gmail.com"
                  className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={smtpFormData.smtp_password}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
                />
              </div>
            </div>

            {/* From Address */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                From Address *
              </label>
              <input
                type="email"
                value={smtpFormData.smtp_from_address}
                onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_from_address: e.target.value })}
                placeholder="bambuddy@yourdomain.com"
                className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
              />
            </div>

            {/* Security Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smtpFormData.smtp_use_tls}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_use_tls: e.target.checked })}
                  className="w-4 h-4 rounded border-bambu-dark-tertiary bg-bambu-dark-secondary text-bambu-green focus:ring-bambu-green focus:ring-offset-0"
                />
                <span className="text-sm text-white">Use TLS (STARTTLS)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smtpFormData.smtp_use_ssl}
                  onChange={(e) => setSmtpFormData({ ...smtpFormData, smtp_use_ssl: e.target.checked })}
                  className="w-4 h-4 rounded border-bambu-dark-tertiary bg-bambu-dark-secondary text-bambu-green focus:ring-bambu-green focus:ring-offset-0"
                />
                <span className="text-sm text-white">Use SSL/TLS</span>
              </label>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSaveSMTP}
                disabled={saveSMTPMutation.isPending}
              >
                {saveSMTPMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save SMTP Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test SMTP */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-bambu-green" />
            <h2 className="text-lg font-semibold text-white">Test SMTP Connection</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-bambu-gray">
              Send a test email to verify your SMTP configuration is working correctly.
            </p>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Test Email Address
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className="w-full px-3 py-2 bg-bambu-dark-secondary border border-bambu-dark-tertiary rounded-lg text-white placeholder-bambu-gray focus:outline-none focus:ring-2 focus:ring-bambu-green/50 focus:border-bambu-green"
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleTestSMTP}
                disabled={testSMTPMutation.isPending || !smtpSettings?.configured}
              >
                {testSMTPMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
