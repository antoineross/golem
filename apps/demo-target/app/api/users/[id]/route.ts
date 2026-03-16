import { NextResponse } from "next/server";
import { users } from "../../../data";

// VULNERABILITY: no authorization check -- IDOR
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const userId = parseInt(id, 10);
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
