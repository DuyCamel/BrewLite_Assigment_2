import type { Metadata } from "next";
import "./globals.css";
import { CustomerLayout } from "@/views/layouts/CustomerLayout";
export const metadata: Metadata = {
  title: "BrewLite · Một chút ngon cho ngày mới",
  description: "Khám phá đồ uống, đặt trước và nhận tại quầy.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <div className="mobile-shell">
          <CustomerLayout>{children}</CustomerLayout>
        </div>
      </body>
    </html>
  );
}
