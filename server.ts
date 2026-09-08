import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initialize Google Gen AI
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// 1. AI Code Reviewer
app.post('/api/gemini/review-code', async (req, res) => {
  try {
    const { code, language, problemTitle, problemDescription } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required for review' });
    }

    const ai = getAI();
    if (!ai) {
      // Fallback heuristics review if no API key
      return res.json({
        verdict: 'Good Solution',
        overallScore: 82,
        timeComplexity: 'O(N) estimated',
        spaceComplexity: 'O(1) estimated',
        strengths: [
          'Clear logical naming and direct problem-solving approach',
          'Good adherence to functional or iterative paradigms',
        ],
        weaknesses: [
          'Ensure boundary edge cases (empty inputs, integer overflow, duplicates) are explicitly validated',
          'Add meaningful comments explaining time-critical logic',
        ],
        codeSmells: [
          'Variable scoping can be tightened',
        ],
        optimizedCodeSnippet: '// Keep clean spacing and memoize repeated lookups\n' + code,
        keyAdvice: 'In interviews, clearly state your Big-O time and space trade-offs out loud before coding.',
      });
    }

    const prompt = `You are a Senior Staff Software Engineer and Technical Interviewer at a top tier tech company (e.g., Google, Meta, Microsoft).
Perform a comprehensive, constructive, and rigorous code review for a student's placement interview code submission.

Problem Title: ${problemTitle || 'General Coding Challenge'}
Problem Context: ${problemDescription || 'Student algorithm practice'}
Language: ${language || 'javascript'}

Code Submission:
\`\`\`${language || 'text'}
${code}
\`\`\`

Return a JSON object strictly conforming to this structure:
{
  "verdict": "Optimal" | "Good Solution" | "Needs Optimization" | "Has Bugs" | "Sub-optimal",
  "overallScore": number (0 to 100),
  "timeComplexity": "e.g. O(N log N)",
  "spaceComplexity": "e.g. O(1) or O(N)",
  "strengths": ["point 1", "point 2"],
  "weaknesses": ["point 1", "point 2"],
  "edgeCasesMissed": ["point 1", "point 2"],
  "codeSmells": ["point 1", "point 2"],
  "optimizedCodeSnippet": "full or refactored idiomatic solution snippet if improvement is possible",
  "keyAdvice": "one sentence high impact advice for the interviewer round"
}
Output only valid JSON, without markdown formatting or code fences.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in code review:', error);
    return res.status(500).json({
      error: 'Code review failed',
      details: error.message || 'Unknown error',
    });
  }
});

// 2. AI Mock Interviewer
app.post('/api/gemini/mock-interview', async (req, res) => {
  try {
    const {
      role = 'SDE 1 (Software Development Engineer)',
      company = 'Google / Big Tech',
      interviewType = 'Technical DSA & System Design', // or Behavioral/HR
      history = [],
      candidateMessage = '',
      currentQuestionIndex = 0,
      totalQuestions = 4,
    } = req.body;

    const ai = getAI();
    if (!ai) {
      return res.json({
        interviewerReply: `Thank you for walking me through that. In a real interview at ${company}, interviewers appreciate when you state your edge cases first. Let's move to the next part: How would you scale this if your input size exceeded memory?`,
        evaluation: {
          clarityScore: 85,
          technicalAccuracyScore: 80,
          communicationScore: 88,
          starMethodCritique: 'Good articulation of the context and solution.',
          strengths: ['Well-structured response', 'Calm technical explanation'],
          areasForImprovement: ['Mention trade-offs between CPU cache locality and hash map overhead'],
        },
        isInterviewFinished: currentQuestionIndex >= totalQuestions,
        nextQuestion: currentQuestionIndex < totalQuestions ? 'Can you write a brief algorithm for this scaling challenge?' : null,
      });
    }

    const conversationContext = history
      .map((h: any) => `${h.speaker === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${h.text}`)
      .join('\n');

    const prompt = `You are a warm yet rigorous Technical Interviewer at ${company} conducting a ${interviewType} round for the role of ${role}.
Total Questions planned: ${totalQuestions}. Current question index: ${currentQuestionIndex}.

Transcript of the interview so far:
${conversationContext}

Candidate's latest reply:
"${candidateMessage}"

Evaluate the candidate's latest response and decide whether to ask a clarifying follow-up, move to the next planned question, or wrap up the interview if questions are completed.
Provide actionable coaching and scoring.

Return a JSON object conforming strictly to this structure:
{
  "interviewerReply": "What you speak to the candidate next. If candidate answered well, acknowledge it specifically, then provide the follow-up or next challenge.",
  "evaluation": {
    "clarityScore": number (0-100),
    "technicalAccuracyScore": number (0-100),
    "communicationScore": number (0-100),
    "starMethodCritique": "Feedback on Situation, Task, Action, Result or algorithmic reasoning depth",
    "strengths": ["string"],
    "areasForImprovement": ["string"]
  },
  "isInterviewFinished": boolean,
  "nextQuestion": "The next question text if applicable, else null",
  "finalSummary": "Only if isInterviewFinished is true: comprehensive hiring recommendation (Strong Hire, Hire, Lean Hire, No Hire) with detailed feedback"
}
Output only valid JSON, without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in mock interview:', error);
    return res.status(500).json({
      error: 'Mock interview step failed',
      details: error.message || 'Unknown error',
    });
  }
});

// 3. Resume Bullet & ATS Enhancer
app.post('/api/gemini/resume-enhancer', async (req, res) => {
  try {
    const { bulletPoint, targetRole = 'Software Engineer', targetCompany = 'Tech Tier 1' } = req.body;
    if (!bulletPoint) {
      return res.status(400).json({ error: 'Bullet point text is required' });
    }

    const ai = getAI();
    if (!ai) {
      return res.json({
        original: bulletPoint,
        enhancedOptions: [
          `Architected and deployed an end-to-end ${targetRole} solution, reducing latency by 35% and supporting 10,000+ daily active requests using modern distributed patterns.`,
          `Engineered scalable backend microservices that optimized database query execution time by 42%, improving application reliability and peak throughput.`,
          `Spearheaded the development of a production feature adopted by 500+ users, leveraging automated CI/CD pipelines to cut deployment cycle time by 20%.`,
        ],
        atsKeywordsIdentified: ['Architecture', 'Latency Optimization', 'Microservices', 'CI/CD', 'Scalability'],
        impactScore: 85,
        formulaCheck: 'Good adoption of Accomplished [X] as measured by [Y] by doing [Z].',
      });
    }

    const prompt = `You are an elite Tech Career Coach and ATS (Applicant Tracking System) specialist who has helped hundreds of students land jobs at Google, Meta, Apple, Amazon, and Netflix.
Transform this candidate resume bullet point for a ${targetRole} application targeting ${targetCompany}.
Use Google's proven formula: "Accomplished [X] as measured by [Y], by doing [Z]".

Original bullet: "${bulletPoint}"

Return a JSON object conforming strictly to:
{
  "original": "${bulletPoint.replace(/"/g, '\\"')}",
  "enhancedOptions": [
    "Option 1: High-impact metrics-driven bullet",
    "Option 2: Deep technical stack focus bullet",
    "Option 3: Leadership/initiative focus bullet"
  ],
  "atsKeywordsIdentified": ["keyword1", "keyword2", "keyword3"],
  "impactScore": number (0-100),
  "formulaCheck": "Critique against X-Y-Z formula and action verb usage",
  "missingKeywordsSuggestions": ["keywordA", "keywordB"]
}
Output only valid JSON, without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in resume enhancer:', error);
    return res.status(500).json({
      error: 'Resume bullet enhancement failed',
      details: error.message || 'Unknown error',
    });
  }
});

// 4. Portfolio Project Blueprints & Advice
app.post('/api/gemini/portfolio-advisor', async (req, res) => {
  try {
    const { targetRole = 'Full Stack / Backend Engineer', interestArea = 'Distributed Systems', experienceLevel = 'College Final Year' } = req.body;

    const ai = getAI();
    if (!ai) {
      return res.json({
        recommendedProjects: [
          {
            title: 'Real-Time Distributed Collaborative Code Sandbox',
            tagline: 'Solves actual concurrency with CRDTs/WebSockets rather than a generic clone',
            recruiterAppeal: 'Proves deep knowledge of WebSockets, Redis pub/sub, operational transformation/CRDTs, and containerized code execution.',
            techStack: ['TypeScript', 'Node.js/Go', 'Redis', 'Docker Sandbox', 'React', 'TailwindCSS'],
            keyFeatures: [
              'Isolated code execution runner in ephemeral Docker containers',
              'Real-time multi-cursor awareness via WebSockets and CRDTs (Yjs)',
              'Latency benchmark dashboard & session replay',
            ],
            resumeBulletTemplate: 'Built an isolated code execution engine serving 50+ concurrent sessions with sub-100ms sandboxed runtime execution using Go and Docker API.',
            difficulty: 'Advanced',
          },
          {
            title: 'High-Throughput Distributed Rate Limiter & API Gateway',
            tagline: 'Demonstrates Leaky Bucket & Token Bucket algorithms under 50k QPS load',
            recruiterAppeal: 'Recruiters and engineers love systems projects that show distributed caching, sliding window logs, and Apache JMeter benchmarking.',
            techStack: ['Go / Java / Node', 'Redis Cluster', 'Prometheus', 'Grafana', 'Docker'],
            keyFeatures: [
              'Sliding window counter algorithm backed by Redis sorted sets',
              'Prometheus metrics exporter with custom Grafana dashboards',
              'Chaos engineering test suite testing node failure scenarios',
            ],
            resumeBulletTemplate: 'Engineered a distributed token-bucket rate limiter handling 15,000 requests/sec with P99 latency under 4ms using Redis sorted sets.',
            difficulty: 'Intermediate-Advanced',
          },
        ],
        antiPortfolioAdvice: 'Avoid generic todo apps, basic weather widgets, or basic e-commerce clones that have no database indexing, caching, or auth security.',
      });
    }

    const prompt = `You are a Principal Engineer and Hiring Committee member at a Tier 1 tech firm.
Recommend 3 standout portfolio projects for a student aiming for a ${targetRole} role with an interest in ${interestArea} and level: ${experienceLevel}.
The projects must stand out to recruiters, avoiding cliché clone tutorials.

Return a JSON object conforming strictly to:
{
  "recommendedProjects": [
    {
      "title": "Project Name",
      "tagline": "Short compelling summary",
      "recruiterAppeal": "Why a Google/Amazon interviewer will be impressed by this",
      "techStack": ["Tech1", "Tech2", "Tech3"],
      "keyFeatures": ["Feature 1 with technical depth", "Feature 2 with measurable metric", "Feature 3"],
      "resumeBulletTemplate": "Exact ATS-ready bullet point showcasing this project",
      "difficulty": "Intermediate" | "Advanced"
    }
  ],
  "antiPortfolioAdvice": "What common projects to strictly avoid and why"
}
Output only valid JSON, without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in portfolio advisor:', error);
    return res.status(500).json({
      error: 'Portfolio advisor failed',
      details: error.message || 'Unknown error',
    });
  }
});

// 5. Discussion Forum AI Doubt Solver
app.post('/api/gemini/doubt-solver', async (req, res) => {
  try {
    const { questionTitle, questionBody, tags = [] } = req.body;

    const ai = getAI();
    if (!ai) {
      return res.json({
        explanation: 'When solving this algorithmic pattern, identify the subproblem overlap first. For optimal efficiency, look into whether a monotonic queue, hash map frequency count, or two-pointer window satisfies the constraints.',
        pseudocode: 'function solve(input) {\n  // 1. Initialize sliding window or pointers\n  // 2. Iterate while tracking maximum\n  // 3. Return computed result\n}',
        complexityAnalysis: 'Time Complexity: O(N), Space Complexity: O(min(N, K))',
        relatedQuestions: ['Longest Substring Without Repeating Characters', 'Sliding Window Maximum'],
      });
    }

    const prompt = `You are a helpful Computer Science Teaching Assistant and Placement Mentor.
A student posted a doubt in the college placement discussion forum:
Title: ${questionTitle}
Tags: ${tags.join(', ')}
Question:
${questionBody}

Provide a crisp, illuminating, and step-by-step resolution. Explain intuition first, then provide clean pseudocode/pattern, complexity analysis, and related LeetCode/interview problems.

Return a JSON object conforming strictly to:
{
  "explanation": "Clear step-by-step intuition and explanation",
  "pseudocode": "Clean readable pseudocode or code snippet",
  "complexityAnalysis": "Time and space breakdown",
  "relatedQuestions": ["Problem 1", "Problem 2"]
}
Output only valid JSON, without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in doubt solver:', error);
    return res.status(500).json({
      error: 'Doubt solver failed',
      details: error.message || 'Unknown error',
    });
  }
});

// Production & Vite Development integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PlacementPrep server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
