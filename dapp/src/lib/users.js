import bcrypt from "bcryptjs";
import connectDB from "./mongodb";
import User from "./models/User";

export async function findUser(username) {
  await connectDB();
  const user = await User.findOne({
    username: username.toLowerCase(),
  });
  return user;
}

export async function createUser(username, password) {
  await connectDB();

  const existing = await User.findOne({
    username: username.toLowerCase(),
  });
  if (existing) {
    return { error: "Username already exists" };
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    username: username.toLowerCase(),
    password: hash,
  });

  return {
    user: { username: user.username, createdAt: user.createdAt },
  };
}

export async function verifyUser(username, password) {
  const user = await findUser(username);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return { username: user.username, createdAt: user.createdAt };
}

export async function recordLogin(username, ip, userAgent) {
  await connectDB();
  await User.updateOne(
    { username: username.toLowerCase() },
    {
      $push: {
        logins: {
          $each: [{ ip: ip || "", userAgent: userAgent || "", at: new Date() }],
          $slice: -20,
        },
      },
    }
  );
}

export async function getLoginHistory(username) {
  await connectDB();
  const user = await User.findOne(
    { username: username.toLowerCase() },
    { logins: 1 }
  );
  return user?.logins || [];
}
