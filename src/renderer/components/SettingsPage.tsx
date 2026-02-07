import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
    Shield,
    Globe,
    Palette,
    Lock,
    Layout,
    Code,
    ChevronLeft,
    RotateCcw,
    Check,
    Search,
} from 'lucide-react';

interface AppSettings {
    adBlockerEnabled: boolean;
    httpsUpgradeEnabled: boolean;
    defaultSearchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave';
    theme: 'light' | 'dark' | 'system';
    sidebarPosition: 'left' | 'right';
    compactMode: boolean;
    historyEnabled: boolean;
    historyRetentionDays: number;
    clearHistoryOnExit: boolean;
    blockThirdPartyCookies: boolean;
    sendDoNotTrack: boolean;
    openLinksInNewTab: boolean;
    confirmBeforeClosingMultipleTabs: boolean;
    restoreTabsOnStartup: boolean;
    enableDevTools: boolean;
}

interface SettingsPageProps {
    className?: string;
}

type SettingsSection = 'browser' | 'appearance' | 'privacy' | 'tabs' | 'developer';

// Toggle Switch Component
function Toggle({
    enabled,
    onChange,
    disabled = false,
}: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={() => !disabled && onChange(!enabled)}
            className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                "transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
                enabled ? "bg-brand" : "bg-gray-200",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <span
                className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0",
                    "transition duration-200 ease-in-out",
                    enabled ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    );
}

// Setting Row Component
function SettingRow({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-border/40 last:border-0">
            <div className="flex-1 pr-4">
                <h4 className="text-sm font-medium text-text-primary">{label}</h4>
                {description && (
                    <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

// Select Component
function Select<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            className={cn(
                "px-3 py-1.5 rounded-lg border border-border bg-white text-sm",
                "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand",
                "cursor-pointer"
            )}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

// Section Header
function SectionHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description?: string;
}) {
    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
                <Icon className="h-5 w-5 text-brand" />
                <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            </div>
            {description && (
                <p className="text-sm text-text-tertiary">{description}</p>
            )}
        </div>
    );
}

export function SettingsPage({ className }: SettingsPageProps) {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [activeSection, setActiveSection] = useState<SettingsSection>('browser');
    const [isSaving, setIsSaving] = useState(false);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            if (window.electron?.settings) {
                const loadedSettings = await window.electron.settings.getAll();
                setSettings(loadedSettings);
            }
        };
        loadSettings();

        // Subscribe to settings changes
        const unsubscribe = window.electron?.settings.onChanged((data) => {
            if (data.settings) {
                setSettings(data.settings);
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    // Update a single setting
    const updateSetting = useCallback(async <K extends keyof AppSettings>(
        key: K,
        value: AppSettings[K]
    ) => {
        if (!window.electron?.settings) return;

        setIsSaving(true);
        try {
            const updated = await window.electron.settings.set(key, value);
            setSettings(updated);
        } catch (error) {
            console.error('Failed to update setting:', error);
        } finally {
            setIsSaving(false);
        }
    }, []);

    // Reset all settings
    const handleReset = useCallback(async () => {
        if (!window.electron?.settings) return;

        if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
            setIsSaving(true);
            try {
                const defaultSettings = await window.electron.settings.reset();
                setSettings(defaultSettings);
            } catch (error) {
                console.error('Failed to reset settings:', error);
            } finally {
                setIsSaving(false);
            }
        }
    }, []);

    // Navigate back
    const handleBack = useCallback(() => {
        window.electron?.navigation.navigate('poseidon://newtab');
    }, []);

    if (!settings) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-surface">
                <div className="loading-spinner w-8 h-8" />
            </div>
        );
    }

    const sections: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
        { id: 'browser', label: 'Browser', icon: Globe },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'privacy', label: 'Privacy & Security', icon: Lock },
        { id: 'tabs', label: 'Tabs & Navigation', icon: Layout },
        { id: 'developer', label: 'Developer', icon: Code },
    ];

    return (
        <div className={cn(
            "flex h-full w-full bg-surface",
            className
        )}>
            {/* Sidebar Navigation */}
            <nav className="w-56 border-r border-border/40 bg-surface-secondary/30 p-4 flex flex-col">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                </button>

                <h1 className="text-xl font-bold text-text-primary mb-6">Settings</h1>

                <ul className="space-y-1 flex-1">
                    {sections.map((section) => (
                        <li key={section.id}>
                            <button
                                onClick={() => setActiveSection(section.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    activeSection === section.id
                                        ? "bg-brand-muted text-brand-dark"
                                        : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                                )}
                            >
                                <section.icon className="h-4 w-4" />
                                {section.label}
                            </button>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={handleReset}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-error hover:bg-error/5 rounded-lg transition-colors"
                >
                    <RotateCcw className="h-4 w-4" />
                    Reset All
                </button>
            </nav>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto">
                    {/* Browser Section */}
                    {activeSection === 'browser' && (
                        <section>
                            <SectionHeader
                                icon={Globe}
                                title="Browser"
                                description="Core browser settings and defaults"
                            />
                            <div className="bg-white rounded-xl border border-border/60 p-4">
                                <SettingRow
                                    label="Default Search Engine"
                                    description="Used when searching from the address bar"
                                >
                                    <Select
                                        value={settings.defaultSearchEngine}
                                        options={[
                                            { value: 'google', label: 'Google' },
                                            { value: 'duckduckgo', label: 'DuckDuckGo' },
                                            { value: 'bing', label: 'Bing' },
                                            { value: 'brave', label: 'Brave Search' },
                                        ]}
                                        onChange={(v) => updateSetting('defaultSearchEngine', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Ad & Tracker Blocker"
                                    description="Block ads, trackers, and malicious content"
                                >
                                    <Toggle
                                        enabled={settings.adBlockerEnabled}
                                        onChange={(v) => updateSetting('adBlockerEnabled', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="HTTPS Upgrade"
                                    description="Automatically upgrade connections to HTTPS when available"
                                >
                                    <Toggle
                                        enabled={settings.httpsUpgradeEnabled}
                                        onChange={(v) => updateSetting('httpsUpgradeEnabled', v)}
                                    />
                                </SettingRow>
                            </div>
                        </section>
                    )}

                    {/* Appearance Section */}
                    {activeSection === 'appearance' && (
                        <section>
                            <SectionHeader
                                icon={Palette}
                                title="Appearance"
                                description="Customize how Poseidon looks"
                            />
                            <div className="bg-white rounded-xl border border-border/60 p-4">
                                <SettingRow
                                    label="Theme"
                                    description="Choose your preferred color scheme"
                                >
                                    <Select
                                        value={settings.theme}
                                        options={[
                                            { value: 'light', label: 'Light' },
                                            { value: 'dark', label: 'Dark (Coming Soon)' },
                                            { value: 'system', label: 'System (Coming Soon)' },
                                        ]}
                                        onChange={(v) => updateSetting('theme', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Sidebar Position"
                                    description="Choose which side the sidebar appears on"
                                >
                                    <Select
                                        value={settings.sidebarPosition}
                                        options={[
                                            { value: 'left', label: 'Left' },
                                            { value: 'right', label: 'Right (Coming Soon)' },
                                        ]}
                                        onChange={(v) => updateSetting('sidebarPosition', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Compact Mode"
                                    description="Use smaller UI elements to show more content"
                                >
                                    <Toggle
                                        enabled={settings.compactMode}
                                        onChange={(v) => updateSetting('compactMode', v)}
                                    />
                                </SettingRow>
                            </div>
                        </section>
                    )}

                    {/* Privacy Section */}
                    {activeSection === 'privacy' && (
                        <section>
                            <SectionHeader
                                icon={Lock}
                                title="Privacy & Security"
                                description="Control your privacy and data"
                            />
                            <div className="bg-white rounded-xl border border-border/60 p-4">
                                <SettingRow
                                    label="Save Browsing History"
                                    description="Remember sites you visit for autocomplete and suggestions"
                                >
                                    <Toggle
                                        enabled={settings.historyEnabled}
                                        onChange={(v) => updateSetting('historyEnabled', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="History Retention"
                                    description="How long to keep browsing history"
                                >
                                    <Select
                                        value={String(settings.historyRetentionDays) as any}
                                        options={[
                                            { value: '7', label: '1 Week' },
                                            { value: '30', label: '1 Month' },
                                            { value: '90', label: '3 Months' },
                                            { value: '365', label: '1 Year' },
                                            { value: '-1', label: 'Forever' },
                                        ]}
                                        onChange={(v) => updateSetting('historyRetentionDays', parseInt(v))}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Clear History on Exit"
                                    description="Automatically clear browsing history when closing Poseidon"
                                >
                                    <Toggle
                                        enabled={settings.clearHistoryOnExit}
                                        onChange={(v) => updateSetting('clearHistoryOnExit', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Block Third-Party Cookies"
                                    description="Prevent cross-site tracking via cookies"
                                >
                                    <Toggle
                                        enabled={settings.blockThirdPartyCookies}
                                        onChange={(v) => updateSetting('blockThirdPartyCookies', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Send Do Not Track"
                                    description="Request websites not to track you (not all sites honor this)"
                                >
                                    <Toggle
                                        enabled={settings.sendDoNotTrack}
                                        onChange={(v) => updateSetting('sendDoNotTrack', v)}
                                    />
                                </SettingRow>

                                <div className="pt-4 border-t border-border/40 mt-4">
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Are you sure you want to clear all browsing history?')) {
                                                window.electron?.history.clear();
                                            }
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-error bg-error/5 hover:bg-error/10 rounded-lg transition-colors"
                                    >
                                        Clear Browsing History
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Tabs Section */}
                    {activeSection === 'tabs' && (
                        <section>
                            <SectionHeader
                                icon={Layout}
                                title="Tabs & Navigation"
                                description="Configure tab behavior and navigation"
                            />
                            <div className="bg-white rounded-xl border border-border/60 p-4">
                                <SettingRow
                                    label="Open Links in New Tab"
                                    description="Open external links in a new tab instead of the current one"
                                >
                                    <Toggle
                                        enabled={settings.openLinksInNewTab}
                                        onChange={(v) => updateSetting('openLinksInNewTab', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Confirm Before Closing Multiple Tabs"
                                    description="Show a confirmation dialog when closing multiple tabs at once"
                                >
                                    <Toggle
                                        enabled={settings.confirmBeforeClosingMultipleTabs}
                                        onChange={(v) => updateSetting('confirmBeforeClosingMultipleTabs', v)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    label="Restore Tabs on Startup"
                                    description="Reopen tabs from your last session when starting Poseidon"
                                >
                                    <Toggle
                                        enabled={settings.restoreTabsOnStartup}
                                        onChange={(v) => updateSetting('restoreTabsOnStartup', v)}
                                    />
                                </SettingRow>
                            </div>
                        </section>
                    )}

                    {/* Developer Section */}
                    {activeSection === 'developer' && (
                        <section>
                            <SectionHeader
                                icon={Code}
                                title="Developer"
                                description="Advanced settings for developers"
                            />
                            <div className="bg-white rounded-xl border border-border/60 p-4">
                                <SettingRow
                                    label="Enable DevTools"
                                    description="Allow opening Chrome DevTools for web pages (F12 or Cmd+Option+I)"
                                >
                                    <Toggle
                                        enabled={settings.enableDevTools}
                                        onChange={(v) => updateSetting('enableDevTools', v)}
                                    />
                                </SettingRow>
                            </div>

                            <div className="mt-6 p-4 bg-surface-tertiary/50 rounded-xl">
                                <h4 className="text-sm font-medium text-text-primary mb-2">About Poseidon</h4>
                                <div className="space-y-1 text-xs text-text-tertiary">
                                    <p>Version: 0.1.0 (Beta)</p>
                                    <p>Built with Electron + React + TypeScript</p>
                                    <p>Powered by Claude AI</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Saving indicator */}
                    {isSaving && (
                        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg shadow-lg">
                            <div className="loading-spinner w-4 h-4 border-white" />
                            <span className="text-sm">Saving...</span>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
