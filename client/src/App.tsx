import React, { useState, useCallback, useEffect } from 'react';

interface BugReport {
    title: string;
    description: string;
    stepsToReproduce: string[];
    expectedBehavior: string;
    actualBehavior: string;
    severity: string;
    priority: string;
    environment: string;
    additionalNotes: string;
}

interface Settings {
    jiraUrl: string;
    jiraEmail: string;
    jiraApiToken: string;
    projectKey: string;
    issueType: string;
    groqApiKey: string;
}

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
    leaving?: boolean;
}

interface JiraResult {
    issueKey: string;
    issueUrl: string;
}

const SETTINGS_KEY = 'bugenhancer_settings';

function loadSettingsFromStorage(): Settings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaultSettings();
}

function saveSettingsToStorage(s: Settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function defaultSettings(): Settings {
    return {
        jiraUrl: '',
        jiraEmail: '',
        jiraApiToken: '',
        projectKey: '',
        issueType: 'Bug',
        groqApiKey: '',
    };
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const [header, base64] = dataUrl.split(',');
            const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/png';
            resolve({ base64, mimeType });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ========== Toast System ==========
let toastId = 0;

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <div key={t.id} className={`toast ${t.type} ${t.leaving ? 'leaving' : ''}`} onClick={() => onRemove(t.id)}>
                    <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}

// ========== DropZone ==========
function DropZone({
    file,
    preview,
    onFileDrop,
    onRemove,
}: {
    file: File | null;
    preview: string | null;
    onFileDrop: (f: File) => void;
    onRemove: () => void;
}) {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile && droppedFile.type.startsWith('image/')) {
                onFileDrop(droppedFile);
            }
        },
        [onFileDrop]
    );

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const selected = e.target.files?.[0];
            if (selected && selected.type.startsWith('image/')) {
                onFileDrop(selected);
            }
        },
        [onFileDrop]
    );

    if (file && preview) {
        return (
            <div className="dropzone-wrapper">
                <div className="preview-container">
                    <img src={preview} alt="Bug screenshot" className="preview-image" />
                    <div className="preview-overlay">
                        <button className="remove-btn" onClick={onRemove} title="Remove screenshot">
                            ✕
                        </button>
                    </div>
                    <div className="preview-filename">
                        📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dropzone-wrapper">
            <div
                className={`dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <div className="dropzone-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>
                <p className="dropzone-text">Drag & drop your bug screenshot here</p>
                <p className="dropzone-hint">
                    or <span>browse files</span> · PNG, JPG, GIF up to 20MB
                </p>
                <input ref={inputRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </div>
        </div>
    );
}

// ========== Settings Modal ==========
function SettingsModal({
    settings,
    onChange,
    onClose,
    onSave,
    addToast,
}: {
    settings: Settings;
    onChange: (s: Settings) => void;
    onClose: () => void;
    onSave: () => void;
    addToast: (type: Toast['type'], message: string) => void;
}) {
    const [testingJira, setTestingJira] = useState(false);
    const [testingGroq, setTestingGroq] = useState(false);
    const [jiraResult, setJiraResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [groqResult, setGroqResult] = useState<{ ok: boolean; msg: string } | null>(null);

    const update = (key: keyof Settings, value: string) => {
        onChange({ ...settings, [key]: value });
    };

    const testJira = async () => {
        setTestingJira(true);
        setJiraResult(null);
        try {
            const res = await fetch('/api/test-jira', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jiraUrl: settings.jiraUrl,
                    jiraEmail: settings.jiraEmail,
                    jiraApiToken: settings.jiraApiToken,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setJiraResult({ ok: true, msg: data.message });
                addToast('success', 'Jira connection successful!');
            } else {
                setJiraResult({ ok: false, msg: data.error || 'Connection failed' });
                addToast('error', data.error || 'Jira connection failed');
            }
        } catch (err: any) {
            setJiraResult({ ok: false, msg: err.message });
            addToast('error', 'Jira connection failed');
        }
        setTestingJira(false);
    };

    const testGroq = async () => {
        setTestingGroq(true);
        setGroqResult(null);
        try {
            const res = await fetch('/api/test-groq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groqApiKey: settings.groqApiKey }),
            });
            const data = await res.json();
            if (data.success) {
                setGroqResult({ ok: true, msg: data.message });
                addToast('success', 'Groq connection successful!');
            } else {
                setGroqResult({ ok: false, msg: data.error || 'Connection failed' });
                addToast('error', data.error || 'Groq connection failed');
            }
        } catch (err: any) {
            setGroqResult({ ok: false, msg: err.message });
            addToast('error', 'Groq connection failed');
        }
        setTestingGroq(false);
    };

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <h2>
                        <span>⚙️</span> Settings
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="modal-body">
                    {/* Jira Section */}
                    <div className="settings-section">
                        <div className="settings-section-title">Jira Connection</div>

                        <div className="settings-field">
                            <label>Jira Base URL</label>
                            <input
                                type="url"
                                placeholder="https://yourcompany.atlassian.net"
                                value={settings.jiraUrl}
                                onChange={(e) => update('jiraUrl', e.target.value)}
                            />
                        </div>

                        <div className="settings-field">
                            <label>Email Address</label>
                            <input
                                type="email"
                                placeholder="you@company.com"
                                value={settings.jiraEmail}
                                onChange={(e) => update('jiraEmail', e.target.value)}
                            />
                        </div>

                        <div className="settings-field">
                            <label>API Token</label>
                            <input
                                type="password"
                                placeholder="Your Jira API token"
                                value={settings.jiraApiToken}
                                onChange={(e) => update('jiraApiToken', e.target.value)}
                            />
                        </div>

                        <div className="settings-field">
                            <label>Project Key</label>
                            <input
                                type="text"
                                placeholder="e.g. VWO"
                                value={settings.projectKey}
                                onChange={(e) => update('projectKey', e.target.value)}
                            />
                        </div>

                        <div className="settings-field">
                            <label>Issue Type</label>
                            <select value={settings.issueType} onChange={(e) => update('issueType', e.target.value)}>
                                <option value="Bug">Bug</option>
                                <option value="Task">Task</option>
                                <option value="Story">Story</option>
                                <option value="Epic">Epic</option>
                            </select>
                        </div>

                        <div className="settings-actions">
                            <button className={`test-btn ${jiraResult ? (jiraResult.ok ? 'success' : 'error') : ''}`} onClick={testJira} disabled={testingJira}>
                                {testingJira ? (
                                    <>
                                        <span className="spinner" /> Testing...
                                    </>
                                ) : (
                                    <>🔗 Test Jira Connection</>
                                )}
                            </button>
                        </div>

                        {jiraResult && (
                            <div className={`connection-result ${jiraResult.ok ? 'success' : 'error'}`}>{jiraResult.msg}</div>
                        )}
                    </div>

                    {/* Groq Section */}
                    <div className="settings-section">
                        <div className="settings-section-title">Groq API</div>

                        <div className="settings-field">
                            <label>Groq API Key</label>
                            <input
                                type="password"
                                placeholder="gsk_..."
                                value={settings.groqApiKey}
                                onChange={(e) => update('groqApiKey', e.target.value)}
                            />
                        </div>

                        <div className="settings-actions">
                            <button className={`test-btn ${groqResult ? (groqResult.ok ? 'success' : 'error') : ''}`} onClick={testGroq} disabled={testingGroq}>
                                {testingGroq ? (
                                    <>
                                        <span className="spinner" /> Testing...
                                    </>
                                ) : (
                                    <>🤖 Test Groq Connection</>
                                )}
                            </button>
                        </div>

                        {groqResult && (
                            <div className={`connection-result ${groqResult.ok ? 'success' : 'error'}`}>{groqResult.msg}</div>
                        )}
                    </div>

                    <button
                        className="save-btn"
                        onClick={() => {
                            onSave();
                            addToast('success', 'Settings saved!');
                        }}
                    >
                        💾 Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}

// ========== Bug Report View ==========
function BugReportView({
    report,
    onChange,
    onPush,
    pushing,
    jiraResult,
}: {
    report: BugReport;
    onChange: (r: BugReport) => void;
    onPush: () => void;
    pushing: boolean;
    jiraResult: JiraResult | null;
}) {
    const update = (key: keyof BugReport, value: any) => {
        onChange({ ...report, [key]: value });
    };

    const updateStep = (index: number, value: string) => {
        const steps = [...report.stepsToReproduce];
        steps[index] = value;
        onChange({ ...report, stepsToReproduce: steps });
    };

    const addStep = () => {
        onChange({ ...report, stepsToReproduce: [...report.stepsToReproduce, ''] });
    };

    const removeStep = (index: number) => {
        const steps = report.stepsToReproduce.filter((_, i) => i !== index);
        onChange({ ...report, stepsToReproduce: steps });
    };

    return (
        <div className="bug-report">
            <div className="bug-report-header">
                <h2>
                    <span className="icon">✓</span> AI-Generated Bug Report
                </h2>
                <span className={`status-badge ${report.severity.toLowerCase()}`}>{report.severity}</span>
            </div>

            <div className="bug-report-card">
                <div className="report-field">
                    <label>Title</label>
                    <input type="text" value={report.title} onChange={(e) => update('title', e.target.value)} />
                </div>

                <div className="report-field">
                    <label>Description</label>
                    <textarea value={report.description} onChange={(e) => update('description', e.target.value)} />
                </div>

                <div className="report-field">
                    <label>Steps to Reproduce</label>
                    <ol className="steps-list">
                        {report.stepsToReproduce.map((step, i) => (
                            <li key={i}>
                                <input type="text" value={step} onChange={(e) => updateStep(i, e.target.value)} />
                                <button className="remove-btn" onClick={() => removeStep(i)} style={{ width: 24, height: 24, fontSize: 12 }}>
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ol>
                    <button
                        className="test-btn"
                        onClick={addStep}
                        style={{ marginTop: 8, width: 'auto', padding: '6px 14px', minWidth: 'auto' }}
                    >
                        + Add Step
                    </button>
                </div>

                <div className="report-field">
                    <label>Expected Behavior</label>
                    <textarea value={report.expectedBehavior} onChange={(e) => update('expectedBehavior', e.target.value)} />
                </div>

                <div className="report-field">
                    <label>Actual Behavior</label>
                    <textarea value={report.actualBehavior} onChange={(e) => update('actualBehavior', e.target.value)} />
                </div>

                <div className="report-row">
                    <div className="report-field">
                        <label>Severity</label>
                        <select value={report.severity} onChange={(e) => update('severity', e.target.value)}>
                            <option>Critical</option>
                            <option>Major</option>
                            <option>Minor</option>
                            <option>Trivial</option>
                        </select>
                    </div>
                    <div className="report-field">
                        <label>Priority</label>
                        <select value={report.priority} onChange={(e) => update('priority', e.target.value)}>
                            <option>Highest</option>
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                            <option>Lowest</option>
                        </select>
                    </div>
                </div>

                <div className="report-field">
                    <label>Environment</label>
                    <input type="text" value={report.environment} onChange={(e) => update('environment', e.target.value)} />
                </div>

                <div className="report-field">
                    <label>Additional Notes</label>
                    <textarea value={report.additionalNotes} onChange={(e) => update('additionalNotes', e.target.value)} />
                </div>

                <button className="push-jira-btn" onClick={onPush} disabled={pushing}>
                    {pushing ? (
                        <>
                            <span className="spinner" /> Pushing to Jira...
                        </>
                    ) : (
                        <>
                            🚀 Push to Jira
                        </>
                    )}
                </button>

                {jiraResult && (
                    <div className="jira-success">
                        <h3>🎉 Ticket Created!</h3>
                        <p>
                            Issue <a href={jiraResult.issueUrl} target="_blank" rel="noreferrer">{jiraResult.issueKey}</a> has been created in Jira with the screenshot attached.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ========== Main App ==========
export default function App() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
    const [notes, setNotes] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<Settings>(loadSettingsFromStorage);
    const [bugReport, setBugReport] = useState<BugReport | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [jiraResult, setJiraResult] = useState<JiraResult | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: Toast['type'], message: string) => {
        const id = ++toastId;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 300);
        }, 4000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const handleFileDrop = useCallback(async (f: File) => {
        setFile(f);
        setPreview(URL.createObjectURL(f));
        setBugReport(null);
        setJiraResult(null);
        // Convert to base64 immediately
        try {
            const data = await fileToBase64(f);
            setImageData(data);
        } catch {
            setImageData(null);
        }
    }, []);

    const handleRemoveFile = useCallback(() => {
        if (preview) URL.revokeObjectURL(preview);
        setFile(null);
        setPreview(null);
        setImageData(null);
        setBugReport(null);
        setJiraResult(null);
    }, [preview]);

    const saveSettings = () => {
        saveSettingsToStorage(settings);
    };

    const handleAnalyze = async () => {
        if (!file || !imageData) {
            addToast('error', 'Please upload a screenshot first');
            return;
        }
        if (!settings.groqApiKey) {
            addToast('error', 'Please set your Groq API key in Settings');
            setShowSettings(true);
            return;
        }

        setAnalyzing(true);
        setBugReport(null);
        setJiraResult(null);

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64Image: imageData.base64,
                    mimeType: imageData.mimeType,
                    notes,
                    groqApiKey: settings.groqApiKey,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setBugReport(data.bugReport);
                addToast('success', 'Screenshot analyzed successfully!');
            } else {
                addToast('error', data.error || 'Analysis failed');
            }
        } catch (err: any) {
            addToast('error', 'Failed to analyze screenshot: ' + err.message);
        }

        setAnalyzing(false);
    };

    const handlePushToJira = async () => {
        if (!bugReport) return;
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraApiToken || !settings.projectKey) {
            addToast('error', 'Please configure Jira settings first');
            setShowSettings(true);
            return;
        }

        setPushing(true);

        try {
            const res = await fetch('/api/push-to-jira', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jiraUrl: settings.jiraUrl,
                    jiraEmail: settings.jiraEmail,
                    jiraApiToken: settings.jiraApiToken,
                    projectKey: settings.projectKey,
                    issueType: settings.issueType,
                    bugReport,
                    base64Image: imageData?.base64 || null,
                    mimeType: imageData?.mimeType || null,
                    fileName: file?.name || 'screenshot.png',
                }),
            });

            const data = await res.json();

            if (data.success) {
                setJiraResult({ issueKey: data.issueKey, issueUrl: data.issueUrl });
                addToast('success', `Jira ticket ${data.issueKey} created!`);
            } else {
                addToast('error', data.error || 'Failed to create Jira ticket');
            }
        } catch (err: any) {
            addToast('error', 'Failed to push to Jira: ' + err.message);
        }

        setPushing(false);
    };

    return (
        <>
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            <div className="app-container">
                {/* Header */}
                <header className="app-header">
                    <div className="app-title">
                        <div className="logo-icon">🐛</div>
                        <h1>Bug Report Enhancer</h1>
                    </div>
                    <button className="settings-btn" onClick={() => setShowSettings(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        Settings
                    </button>
                </header>

                {/* Drop Zone */}
                <DropZone file={file} preview={preview} onFileDrop={handleFileDrop} onRemove={handleRemoveFile} />

                {/* Additional Notes */}
                <div className="notes-section">
                    <label className="notes-label">Additional Notes</label>
                    <textarea
                        className="notes-textarea"
                        placeholder="Describe the context, steps you took, or any extra details about this bug..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>

                {/* Analyze Button */}
                <button className="analyze-btn" onClick={handleAnalyze} disabled={!file || analyzing}>
                    {analyzing ? (
                        <>
                            <span className="spinner" /> Analyzing with AI...
                        </>
                    ) : (
                        <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            Analyze and push to JIRA
                        </>
                    )}
                </button>

                {/* Bug Report */}
                {bugReport && (
                    <BugReportView
                        report={bugReport}
                        onChange={setBugReport}
                        onPush={handlePushToJira}
                        pushing={pushing}
                        jiraResult={jiraResult}
                    />
                )}
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <SettingsModal
                    settings={settings}
                    onChange={setSettings}
                    onClose={() => setShowSettings(false)}
                    onSave={saveSettings}
                    addToast={addToast}
                />
            )}
        </>
    );
}
