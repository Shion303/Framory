export function getStorageMode() {
  return process.env.FRAMORY_STORAGE === "prisma" ? "prisma" : "file";
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabile ambiente mancante: ${name}`);
  }
  return value;
}

export function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  const required = ["DATABASE_URL", "FRAMORY_SESSION_SECRET", "FRAMORY_APP_URL"];
  for (const key of required) {
    getRequiredEnv(key);
  }
  if (process.env.FRAMORY_STORAGE !== "prisma") {
    throw new Error("In produzione FRAMORY_STORAGE deve essere prisma.");
  }
}
