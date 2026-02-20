import { Router, Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = Router();
const SETTINGS_FILE = path.join(__dirname, '..', '..', 'settings.json');

interface Settings {
    jiraUrl: string;
    jiraEmail: string;
    jiraApiToken: string;
    projectKey: string;
    issueType: string;
    groqApiKey: string;
}

const defaultSettings: Settings = {
    jiraUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    projectKey: '',
    issueType: 'Bug',
    groqApiKey: '',
};

function loadSettings(): Settings {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            return { ...defaultSettings, ...JSON.parse(data) };
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return defaultSettings;
}

function saveSettingsToFile(settings: Settings): void {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

router.get('/settings', (_req: Request, res: Response) => {
    const settings = loadSettings();
    res.json({ success: true, settings });
});

router.post('/settings', (req: Request, res: Response) => {
    try {
        const settings: Settings = {
            jiraUrl: req.body.jiraUrl || '',
            jiraEmail: req.body.jiraEmail || '',
            jiraApiToken: req.body.jiraApiToken || '',
            projectKey: req.body.projectKey || '',
            issueType: req.body.issueType || 'Bug',
            groqApiKey: req.body.groqApiKey || '',
        };
        saveSettingsToFile(settings);
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to save settings', details: error.message });
    }
});

router.post('/test-groq', async (req: Request, res: Response): Promise<void> => {
    try {
        const { groqApiKey } = req.body;

        if (!groqApiKey) {
            res.status(400).json({ error: 'Groq API key is required' });
            return;
        }

        const response = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
            },
            timeout: 10000,
        });

        // Check if llama-4-scout model is available
        const models = response.data?.data || [];
        const hasScout = models.some((m: any) => m.id?.includes('llama-4-scout'));

        res.json({
            success: true,
            message: hasScout
                ? '✅ Connected! Llama 4 Scout model is available.'
                : '⚠️ Connected, but Llama 4 Scout model was not found in available models.',
            modelsCount: models.length,
        });
    } catch (error: any) {
        res.status(500).json({
            error: 'Groq connection failed',
            details: error?.response?.data?.error?.message || error.message,
        });
    }
});

export { router as settingsRoutes };
