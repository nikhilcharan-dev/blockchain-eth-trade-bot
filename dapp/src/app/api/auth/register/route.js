import { createUser } from "@/lib/users";
import { signToken } from "@/lib/jwt";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const limit = checkRateLimit(`register:${ip}`);
    if (!limit.allowed) {
      return Response.json(
        { error: `Too many attempts. Try again in ${limit.retryAfter}s.` },
        { status: 429 }
      );
    }

    const { username, password } = await request.json();

    if (!username?.trim() || !password?.trim()) {
      return Response.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (username.trim().length < 3 || username.trim().length > 30) {
      return Response.json(
        { error: "Username must be 3-30 characters" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return Response.json(
        { error: "Username can only contain letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json(
        { error: "Password must be 8-128 characters" },
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
      `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}`
    );

    return response;
  } catch (err) {
    console.error("Register error:", err);
    return Response.json({ error: "Registration failed" }, { status: 500 });
  }
}
