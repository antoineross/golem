import { NextResponse } from "next/server";

// VULNERABILITY: no server-side validation of total against actual prices
export async function POST(request: Request) {
  const body = await request.json();
  const { items, total } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  if (total === undefined || total === null) {
    return NextResponse.json({ error: "Total is required" }, { status: 400 });
  }

  const orderId = `ORD-${Date.now()}`;

  return NextResponse.json({
    success: true,
    orderId,
    total,
    itemCount: items.length,
    message: `Order ${orderId} placed successfully for $${Number(total).toFixed(2)}`,
  });
}
