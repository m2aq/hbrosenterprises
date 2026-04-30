import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 8080),
  dataProvider: process.env.DATA_PROVIDER || "local",
  cloudDatabaseUrl: process.env.CLOUD_DATABASE_URL || "",
  cloudAnonKey: process.env.CLOUD_ANON_KEY || ""
};
