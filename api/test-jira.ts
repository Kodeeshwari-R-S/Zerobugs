import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { jiraUrl, jiraEmail, jiraApiToken } = req.body;

        if (!jiraUrl || !jiraEmail || !jiraApiToken) {
            return res.status(400).json({ error: 'Jira URL, email, and API token are required' });
        }

        const baseUrl = jiraUrl.replace(/\/$/, '');
        const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

        const response = await axios.get(`${baseUrl}/rest/api/3/myself`, {
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json',
            },
            timeout: 10000,
        });

        return res.json({
            success: true,
            message: `Connected as ${response.data.displayName} (${response.data.emailAddress})`,
        });
    } catch (error: any) {
        return res.status(500).json({
            error: 'Jira connection failed',
            details: error?.response?.data?.message || error.message,
        });
    }
}
