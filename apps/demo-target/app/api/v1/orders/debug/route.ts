import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    debug: true,
    orders: [
      { id: "ORD-1001", user_id: 1, email: "alice@company.com", total: 249.97, payment_token: "tok_visa_4242", status: "completed" },
      { id: "ORD-1002", user_id: 2, email: "bob@company.com", total: 79.99, payment_token: "tok_mc_5555", status: "pending" },
      { id: "ORD-1003", user_id: 3, email: "carol@company.com", total: 129.99, payment_token: "tok_amex_3782", status: "completed" },
    ],
    sql_query: "SELECT * FROM orders WHERE status != 'deleted' ORDER BY created_at DESC",
    db_connection: "postgresql://app_user:p4ssw0rd@db.internal:5432/techshop_prod",
  });
}
