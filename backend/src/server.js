import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { createDataProvider } from "./db/provider.js";
import { createHealthRouter } from "./routes/health.js";

const app = express();
const dataProvider = createDataProvider(env.dataProvider);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", createHealthRouter({ dataProvider }));

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});
