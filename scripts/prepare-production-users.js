import "../server/env.js";
import crypto from "node:crypto";
import { clearLoginLockData, createUserData, disableUserData, initializeData, listUsersData, updateUserData } from "../server/dataLayer.js";
import { postgresPool } from "../server/postgresDatabase.js";
import { hashPassword } from "../server/password.js";
import { requireStrongPassword, validateEmail } from "../server/security.js";

const demoEmailPattern = /@ligafut\.local$|@demo\.com$/i;

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    leagueId: user.league_id || user.leagueId || null
  };
}

async function closeConnections() {
  await postgresPool?.end();
}

const email = String(process.env.REAL_SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.REAL_SUPER_ADMIN_PASSWORD || "");
const name = String(process.env.REAL_SUPER_ADMIN_NAME || "Super Admin Produccion").trim();
const disableDemoUsers = boolEnv("DISABLE_DEMO_USERS", false);

await initializeData();

let users = await listUsersData();
const hasRealInput = Boolean(email || password);

if (hasRealInput) {
  if (!validateEmail(email)) {
    console.error("REAL_SUPER_ADMIN_EMAIL no es un correo valido.");
    await closeConnections();
    process.exit(1);
  }

  const passwordError = requireStrongPassword(password);
  if (passwordError) {
    console.error(`REAL_SUPER_ADMIN_PASSWORD invalida: ${passwordError}`);
    await closeConnections();
    process.exit(1);
  }

  const existingUser = users.find((user) => String(user.email).toLowerCase() === email);
  if (existingUser) {
    await updateUserData(existingUser.id, {
      leagueId: null,
      name,
      email,
      role: "super_admin",
      status: "active",
      passwordHash: hashPassword(password)
    });
    await clearLoginLockData(existingUser.id);
    console.log(`Super admin real actualizado: ${email}`);
  } else {
    await createUserData({
      id: `user-${crypto.randomUUID()}`,
      leagueId: null,
      name,
      email,
      role: "super_admin",
      status: "active",
      passwordHash: hashPassword(password)
    });
    console.log(`Super admin real creado: ${email}`);
  }

  users = await listUsersData();
}

const activeRealSuperAdmins = users.filter((user) => (
  user.role === "super_admin" &&
  user.status === "active" &&
  !demoEmailPattern.test(user.email)
));
const demoUsers = users.filter((user) => demoEmailPattern.test(user.email));

console.log("Usuarios actuales:");
for (const user of users) {
  const label = demoEmailPattern.test(user.email) ? "demo/local" : "real";
  console.log(`- ${JSON.stringify({ ...publicUser(user), label })}`);
}

if (disableDemoUsers) {
  if (!activeRealSuperAdmins.length) {
    console.error("No se desactivaron demos: primero crea al menos un super admin real activo.");
    await closeConnections();
    process.exit(1);
  }

  for (const user of demoUsers) {
    if (user.status !== "disabled") {
      await disableUserData(user.id);
      console.log(`Usuario demo deshabilitado: ${user.email}`);
    }
  }
}

const finalUsers = await listUsersData();
const finalActiveRealSuperAdmins = finalUsers.filter((user) => (
  user.role === "super_admin" &&
  user.status === "active" &&
  !demoEmailPattern.test(user.email)
));

console.log(`Super admins reales activos: ${finalActiveRealSuperAdmins.length}`);
if (!finalActiveRealSuperAdmins.length) {
  console.log("Pendiente: crea un super admin real antes de produccion.");
}

await closeConnections();
