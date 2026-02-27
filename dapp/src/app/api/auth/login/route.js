import { verifyUser } from "@/lib/users";
import { signToken } from "@/lib/jwt";

export async function POST(request) {
  try {
    const { username, password, guest } = await request.json();

    // Guest access
    if (guest) {
      const token = await signToken({ username: "Guest", role: "guest" });
      const response = Response.json({
        user: { username: "Guest" },
        message: "Guest access granted",
      });
      response.headers.set(
        "Set-Cookie",
        `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 60 * 60}`
      );
      return response;
    }

    if (!username?.trim() || !password?.trim()) {
      return Response.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await verifyUser(username.trim(), password);

    if (!user) {
      return Response.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const token = await signToken({ username: user.username });

    const response = Response.json({
      user,
      message: "Login successful",
    });

    response.headers.set(
      "Set-Cookie",
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (err) {
    console.error("Login error:", err);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

// Logout — clear auth cookie
export async function DELETE() {
  const response = Response.json({ message: "Logged out" });
  response.headers.set(
    "Set-Cookie",
    "auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
  return response;
}
