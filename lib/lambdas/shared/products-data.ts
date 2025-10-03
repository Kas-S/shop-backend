export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  count: number;
}

export const products: Product[] = [
  {
    id: "1",
    title: "iPhone 14 Pro",
    description: "Latest iPhone with advanced camera system",
    price: 999,
    count: 50
  },
  {
    id: "2", 
    title: "Samsung Galaxy S23",
    description: "Flagship Android smartphone",
    price: 899,
    count: 30
  },
  {
    id: "3",
    title: "MacBook Air M2",
    description: "Lightweight laptop with M2 chip",
    price: 1199,
    count: 25
  },
  {
    id: "4",
    title: "iPad Pro 12.9",
    description: "Professional tablet with M2 chip",
    price: 1099,
    count: 40
  },
  {
    id: "5",
    title: "AirPods Pro 2",
    description: "Wireless earbuds with active noise cancellation",
    price: 249,
    count: 100
  }
];