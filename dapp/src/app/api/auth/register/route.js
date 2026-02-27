import { createUser } from "@/lib/users";
import { signToken } from "@/lib/jwt";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username?.trim() || !password?.trim()) {
      return Response.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (username.trim().length < 3) {
      return Response.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (password.trim().length < 4) {
      return Response.json(
        { error: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    const result = await createUser(username.trim(), password);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 409 });
    }

    const token = await signToken({ username: result.user.username });

    const response = Response.json({
      user: result.user,
      message: "Account created successfully",
    });

    response.headers.set(
      "Set-Cookie",
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );

    return response;
  } catch (err) {
    console.error("Register error:", err);
    return Response.json({ error: "Registration failed" }, { status: 500 });
  }
}
