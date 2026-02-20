import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { base64Image, mimeType, notes, groqApiKey } = req.body;

        if (!base64Image) {
            return res.status(400).json({ error: 'No screenshot provided' });
        }

        if (!groqApiKey) {
            return res.status(400).json({ error: 'Groq API key is required. Please set it in Settings.' });
        }

        const systemPrompt = `You are an expert QA engineer with 10+ years of experience in manual and automation testing. 
Analyze the provided bug screenshot carefully and generate a comprehensive, structured bug report.
Return your analysis as a JSON object with these exact fields:
{
  "title": "A concise, descriptive bug title",
  "description": "Detailed description of the bug observed in the screenshot",
  "stepsToReproduce": ["Step 1", "Step 2", "Step 3"],
  "expectedBehavior": "What should happen",
  "actualBehavior": "What actually happened (as seen in screenshot)",
  "severity": "Critical | Major | Minor | Trivial",
  "priority": "Highest | High | Medium | Low | Lowest",
  "environment": "Best guess based on screenshot (browser, OS, etc.)",
  "additionalNotes": "Any other observations"
}
Return ONLY the JSON object, no markdown fencing, no extra text.`;

        const userMessage = notes
            ? `Analyze this bug screenshot. Additional context from the reporter: "${notes}"`
            : `Analyze this bug screenshot and generate a structured bug report.`;

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userMessage },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType || 'image/png'};base64,${base64Image}`,
                                },
                            },
                        ],
                    },
                ],
                temperature: 0.3,
                max_tokens: 2048,
            },
            {
                headers: {
                    Authorization: `Bearer ${groqApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
            }
        );

        const content = response.data.choices?.[0]?.message?.content || '';

        let bugReport;
        try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            bugReport = JSON.parse(cleaned);
        } catch {
            bugReport = {
                title: 'Bug Report from Screenshot',
                description: content,
                stepsToReproduce: [],
                expectedBehavior: '',
                actualBehavior: '',
                severity: 'Major',
                priority: 'Medium',
                environment: '',
                additionalNotes: notes || '',
            };
        }

        return res.json({ success: true, bugReport });
    } catch (error: any) {
        console.error('Analysis error:', error?.response?.data || error.message);
        return res.status(500).json({
            error: 'Failed to analyze screenshot',
            details: error?.response?.data?.error?.message || error.message,
        });
    }
}
