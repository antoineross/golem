import { NextResponse } from "next/server";

// VULNERABILITY: no authorization check on role field -- privilege escalation
export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, role } = body;

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    user: { name, email, role: role || "user" },
    message: `Profile updated successfully. Role set to: ${role || "user"}`,
  });
}
