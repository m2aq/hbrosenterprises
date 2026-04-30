import { Router } from "express";

export function createHealthRouter({ dataProvider }) {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const db = await dataProvider.getStatus();
    res.json({
      ok: true,
      service: "hbrosenterprises-codex-api",
      db
    });
  });

  return router;
}
