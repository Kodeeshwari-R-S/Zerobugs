import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { groqApiKey } = req.body;

        if (!groqApiKey) {
            return res.status(400).json({ error: 'Groq API key is required' });
        }

        const response = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${groqApiKey}` },
            timeout: 10000,
        });

        const models = response.data?.data || [];
        const hasScout = models.some((m: any) => m.id?.includes('llama-4-scout'));

        return res.json({
            success: true,
            message: hasScout
                ? '✅ Connected! Llama 4 Scout model is available.'
                : '⚠️ Connected, but Llama 4 Scout model was not found in available models.',
            modelsCount: models.length,
        });
    } catch (error: any) {
        return res.status(500).json({
            error: 'Groq connection failed',
            details: error?.response?.data?.error?.message || error.message,
        });
    }
}
