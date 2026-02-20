import { Router, Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';

const router = Router();

router.post('/push-to-jira', async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ error: 'Jira credentials are required. Please configure in Settings.' });
            return;
        }

        if (!bugReport) {
            res.status(400).json({ error: 'Bug report data is required. Analyze a screenshot first.' });
            return;
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

        // Attach screenshot from base64
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

        res.json({
            success: true,
            issueKey,
            issueUrl: `${baseUrl}/browse/${issueKey}`,
        });
    } catch (error: any) {
        console.error('Jira push error:', error?.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to create Jira ticket',
            details: error?.response?.data?.errors || error?.response?.data?.errorMessages || error.message,
        });
    }
});

router.post('/test-jira', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jiraUrl, jiraEmail, jiraApiToken } = req.body;

        if (!jiraUrl || !jiraEmail || !jiraApiToken) {
            res.status(400).json({ error: 'Jira URL, email, and API token are required' });
            return;
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

        res.json({
            success: true,
            message: `Connected as ${response.data.displayName} (${response.data.emailAddress})`,
        });
    } catch (error: any) {
        res.status(500).json({
            error: 'Jira connection failed',
            details: error?.response?.data?.message || error.message,
        });
    }
});

export { router as jiraRoutes };
