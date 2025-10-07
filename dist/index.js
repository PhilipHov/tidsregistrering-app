// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";
var MemStorage = class {
  users;
  workSessions;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.workSessions = /* @__PURE__ */ new Map();
    const defaultUser = {
      id: "default-user",
      username: "philip",
      name: "Philip"
    };
    this.users.set(defaultUser.id, defaultUser);
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async getActiveWorkSession(userId) {
    return Array.from(this.workSessions.values()).find(
      (session) => session.userId === userId && session.isActive
    );
  }
  async createWorkSession(insertSession) {
    const id = randomUUID();
    const session = {
      ...insertSession,
      id,
      isActive: true,
      clockOutTime: insertSession.clockOutTime || null
    };
    this.workSessions.set(id, session);
    return session;
  }
  async clockOut(sessionId, clockOutTime) {
    const session = this.workSessions.get(sessionId);
    if (!session) {
      throw new Error("Work session not found");
    }
    const updatedSession = {
      ...session,
      clockOutTime,
      isActive: false
    };
    this.workSessions.set(sessionId, updatedSession);
    return updatedSession;
  }
  async getUserWorkSessions(userId, limit = 10) {
    return Array.from(this.workSessions.values()).filter((session) => session.userId === userId).sort((a, b) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime()).slice(0, limit);
  }
  async getUserWorkSessionsForDate(userId, date) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return Array.from(this.workSessions.values()).filter((session) => {
      const clockInDate = new Date(session.clockInTime);
      return session.userId === userId && clockInDate >= startOfDay && clockInDate < endOfDay;
    }).sort((a, b) => new Date(a.clockInTime).getTime() - new Date(b.clockInTime).getTime());
  }
};
function createStorage() {
  console.log("Using in-memory storage for reliable deployment");
  return new MemStorage();
}
var storage = createStorage();

// server/openai.ts
import OpenAI from "openai";
var openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
async function getChatResponse(message, context) {
  if (!openai) {
    return "AI chat funktionalitet er ikke tilg\xE6ngelig uden API n\xF8gle. Kontakt administrator for at aktivere denne funktion.";
  }
  try {
    const systemPrompt = `Du er en hj\xE6lpsom AI assistent for en dansk arbejdstidsapp. Du hj\xE6lper brugere med:
- Sp\xF8rgsm\xE5l om arbejdstid og timeregistrering
- Arbejdspladsrelaterede r\xE5d
- Generelle sp\xF8rgsm\xE5l om arbejde
- Support til appen

Svar altid p\xE5 dansk og v\xE6r venlig og professionel. Hold svarene korte og relevante.
${context ? `

Kontekst: ${context}` : ""}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    return response.choices[0].message.content || "Beklager, jeg kunne ikke behandle dit sp\xF8rgsm\xE5l.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "Der opstod en fejl. Pr\xF8v igen senere.";
  }
}

// server/routes.ts
async function registerRoutes(app2) {
  app2.get("/api/user", async (req, res) => {
    const user = await storage.getUser("default-user");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });
  app2.get("/api/work-status", async (req, res) => {
    const activeSession = await storage.getActiveWorkSession("default-user");
    res.json({
      isWorking: !!activeSession,
      activeSession: activeSession || null
    });
  });
  app2.post("/api/clock-in", async (req, res) => {
    try {
      const activeSession = await storage.getActiveWorkSession("default-user");
      if (activeSession) {
        return res.status(400).json({ message: "Already clocked in" });
      }
      const session = await storage.createWorkSession({
        userId: "default-user",
        clockInTime: /* @__PURE__ */ new Date(),
        clockOutTime: null
      });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to clock in" });
    }
  });
  app2.post("/api/clock-out", async (req, res) => {
    try {
      const activeSession = await storage.getActiveWorkSession("default-user");
      if (!activeSession) {
        return res.status(400).json({ message: "No active work session" });
      }
      const session = await storage.clockOut(activeSession.id, /* @__PURE__ */ new Date());
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to clock out" });
    }
  });
  app2.get("/api/work-sessions", async (req, res) => {
    const sessions = await storage.getUserWorkSessions("default-user");
    res.json(sessions);
  });
  app2.get("/api/work-sessions/today", async (req, res) => {
    const today = /* @__PURE__ */ new Date();
    const sessions = await storage.getUserWorkSessionsForDate("default-user", today);
    res.json(sessions);
  });
  app2.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Besked er p\xE5kr\xE6vet" });
      }
      const activeSession = await storage.getActiveWorkSession("default-user");
      const workStatus = activeSession ? "p\xE5 arbejde" : "ikke p\xE5 arbejde";
      const context = `Brugeren er i \xF8jeblikket ${workStatus}.`;
      const response = await getChatResponse(message, context);
      res.json({ response });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Der opstod en fejl" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/config.ts
var config = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || null,
    required: false
    // Set to true when database becomes required
  },
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || "5000", 10),
    host: process.env.HOST || "0.0.0.0",
    nodeEnv: process.env.NODE_ENV || "development"
  },
  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || null
  },
  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET || "fallback-secret-for-demo"
  }
};
function validateConfig() {
  const warnings = [];
  const errors = [];
  if (!config.database.url) {
    if (config.database.required) {
      errors.push("DATABASE_URL is required but not provided");
    } else {
      warnings.push("DATABASE_URL not provided. Using in-memory storage.");
    }
  }
  if (!config.openai.apiKey) {
    warnings.push("OPENAI_API_KEY not provided. Chat functionality will be limited.");
  }
  warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  if (errors.length > 0) {
    errors.forEach((error) => console.error(`Error: ${error}`));
    if (config.server.nodeEnv === "production") {
      console.warn("Continuing with degraded functionality in production...");
    } else {
      throw new Error(`Configuration errors: ${errors.join(", ")}`);
    }
  }
  return {
    hasWarnings: warnings.length > 0,
    hasErrors: errors.length > 0,
    warnings,
    errors
  };
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const configStatus = validateConfig();
  if (configStatus.hasWarnings || configStatus.hasErrors) {
    log(`Configuration status: ${configStatus.warnings.length} warnings, ${configStatus.errors.length} errors`);
  }
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  console.log(`Environment: ${app.get("env")}, NODE_ENV: ${process.env.NODE_ENV}`);
  if (app.get("env") === "development") {
    log("Setting up Vite development server");
    await setupVite(app, server);
  } else {
    log("Setting up static file serving for production");
    serveStatic(app);
  }
  server.listen(config.server.port, config.server.host, () => {
    log(`serving on port ${config.server.port}`);
    log(`Environment: ${config.server.nodeEnv}`);
    log(`Host: ${config.server.host}`);
  });
})();
