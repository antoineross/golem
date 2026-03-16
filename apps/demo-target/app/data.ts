export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  internal_id: string;
}

export const users: User[] = [
  { id: 1, name: "Alice Admin", email: "alice@company.com", role: "admin", internal_id: "INT-001" },
  { id: 2, name: "Bob Builder", email: "bob@company.com", role: "user", internal_id: "INT-002" },
  { id: 3, name: "Carol Chen", email: "carol@company.com", role: "user", internal_id: "INT-003" },
  { id: 4, name: "Dave Debug", email: "dave@company.com", role: "moderator", internal_id: "INT-004" },
  { id: 5, name: "Eve Engineer", email: "eve@company.com", role: "user", internal_id: "INT-005" },
];

export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  description: string;
}

export const products: Product[] = [
  { id: 1, name: "Wireless Headphones", price: 79.99, image: "/products/headphones.svg", description: "Premium noise-canceling headphones" },
  { id: 2, name: "USB-C Hub", price: 49.99, image: "/products/hub.svg", description: "7-in-1 USB-C adapter" },
  { id: 3, name: "Mechanical Keyboard", price: 129.99, image: "/products/keyboard.svg", description: "Cherry MX switches, RGB backlit" },
  { id: 4, name: "Webcam Pro", price: 89.99, image: "/products/webcam.svg", description: "4K streaming webcam with mic" },
];

export const appConfig = {
  apiKey: "sk-fake-key-12345",
  debugMode: true,
  adminEmail: "admin@example.com",
};
