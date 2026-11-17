import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { financialTools } from './services/agent/tools.js';
import { SMSParserService } from './services/ingestion/smsParser.js';
import { ProactiveJobScheduler } from './services/jobs/scheduler.js';

const app = express();
const port = process.env.PORT || 5050;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'aiFinance Backend',
    timestamp: new Date().toISOString()
  });
});

// 1. Transaction Ingestion via SMS / UPI NER
app.post('/api/ingest/sms', (req, res) => {
  const { rawText } = req.body;
  if (!rawText) {
    return res.status(400).json({ error: 'rawText is required' });
  }

  const parsed = SMSParserService.parseSMS(rawText);
  if (!parsed) {
    return res.status(422).json({ error: 'Unable to parse transaction from text' });
  }

  return res.json({
    status: 'success',
    data: parsed
  });
});

// 2. Deterministic Financial Tools Directory (Catalog)
app.get('/api/agent/tools', (req, res) => {
  const tools = Object.values(financialTools).map(t => ({
    name: t.name,
    description: t.description
  }));
  res.json({ tools });
});

// 3. Proactive Background Jobs Status
app.get('/api/proactive/jobs', (req, res) => {
  const scheduler = new ProactiveJobScheduler();
  res.json({ jobs: scheduler.getRegisteredJobs() });
});

app.listen(port, () => {
  console.log(`[aiFinance] Backend server running on http://localhost:${port}`);
  const scheduler = new ProactiveJobScheduler();
  console.log(`[aiFinance] Loaded ${scheduler.getRegisteredJobs().length} proactive background jobs.`);
});
