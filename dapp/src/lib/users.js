import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  const data = fs.readFileSync(USERS_FILE, "utf-8");
  return JSON.parse(data);
}

function writeUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function findUser(username) {
  const users = readUsers();
  return users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
}

export async function createUser(username, password) {
  if (findUser(username)) {
    return { error: "Username already exists" };
  }

  const hash = await bcrypt.hash(password, 10);
  const users = readUsers();
  const user = {
    username,
    password: hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { user: { username: user.username, createdAt: user.createdAt } };
}

export async function verifyUser(username, password) {
  const user = findUser(username);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return { username: user.username, createdAt: user.createdAt };
}
