import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { analyzeRoute } from './routes/analyze';
import { jiraRoutes } from './routes/jira';
import { settingsRoutes } from './routes/settings';

const app = express();
const PORT = 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api', analyzeRoute);
app.use('/api', jiraRoutes);
app.use('/api', settingsRoutes);

app.listen(PORT, () => {
    console.log(`🚀 BugEnhancer server running on http://localhost:${PORT}`);
});
