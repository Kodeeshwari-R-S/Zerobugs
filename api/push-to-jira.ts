import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import FormData from 'form-data';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            jiraUrl,
            jiraEmail,
            jiraApiToken,
            projectKey,
            issueType,
            bugReport,
            base64Image,
            mimeType,
            fileName,
        } = req.body;

        if (!jiraUrl || !jiraEmail || !jiraApiToken || !projectKey) {
            return res.status(400).json({ error: 'Jira credentials are required. Please configure in Settings.' });
        }

        if (!bugReport) {
            return res.status(400).json({ error: 'Bug report data is required. Analyze a screenshot first.' });
        }

        const baseUrl = jiraUrl.replace(/\/$/, '');
        const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

        // Build ADF description
        const descriptionContent: any[] = [];

        if (bugReport.description) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Description' }] },
                { type: 'paragraph', content: [{ type: 'text', text: bugReport.description }] }
            );
        }

        if (bugReport.stepsToReproduce?.length) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Steps to Reproduce' }] },
                {
                    type: 'orderedList',
                    attrs: { order: 1 },
                    content: bugReport.stepsToReproduce.map((step: string) => ({
                        type: 'listItem',
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: step }] }],
                    })),
                }
            );
        }

        if (bugReport.expectedBehavior) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Expected Behavior' }] },
                { type: 'paragraph', content: [{ type: 'text', text: bugReport.expectedBehavior }] }
            );
        }

        if (bugReport.actualBehavior) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Actual Behavior' }] },
                { type: 'paragraph', content: [{ type: 'text', text: bugReport.actualBehavior }] }
            );
        }

        if (bugReport.environment) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Environment' }] },
                { type: 'paragraph', content: [{ type: 'text', text: bugReport.environment }] }
            );
        }

        if (bugReport.additionalNotes) {
            descriptionContent.push(
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Additional Notes' }] },
                { type: 'paragraph', content: [{ type: 'text', text: bugReport.additionalNotes }] }
            );
        }

        const priorityMap: Record<string, string> = {
            Highest: '1', High: '2', Medium: '3', Low: '4', Lowest: '5',
        };

        const issueData: any = {
            fields: {
                project: { key: projectKey },
                summary: bugReport.title || 'Bug Report from Screenshot',
                description: { type: 'doc', version: 1, content: descriptionContent },
                issuetype: { name: issueType || 'Bug' },
            },
        };

        if (bugReport.priority && priorityMap[bugReport.priority]) {
            issueData.fields.priority = { id: priorityMap[bugReport.priority] };
        }

        // Create Jira issue
        const createResponse = await axios.post(
            `${baseUrl}/rest/api/3/issue`,
            issueData,
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                timeout: 30000,
            }
        );

        const issueKey = createResponse.data.key;

        // Attach screenshot if available
        if (base64Image) {
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const formData = new FormData();
            formData.append('file', imageBuffer, {
                filename: fileName || 'screenshot.png',
                contentType: mimeType || 'image/png',
            });

            await axios.post(
                `${baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
                formData,
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'X-Atlassian-Token': 'no-check',
                        ...formData.getHeaders(),
                    },
                    timeout: 30000,
                }
            );
        }

        return res.json({
            success: true,
            issueKey,
            issueUrl: `${baseUrl}/browse/${issueKey}`,
        });
    } catch (error: any) {
        console.error('Jira push error:', error?.response?.data || error.message);
        return res.status(500).json({
            error: 'Failed to create Jira ticket',
            details: error?.response?.data?.errors || error?.response?.data?.errorMessages || error.message,
        });
    }
}
