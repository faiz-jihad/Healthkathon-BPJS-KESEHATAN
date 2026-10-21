import React from "react";

export const metadata = {
  title: "AURA-JKN Backend API Service (Next.js + PostgreSQL)",
  description: "Pre-Payment Fraud Risk Gate & Human-in-the-Loop Backend Service",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0f172a",
          color: "#f8fafc",
        }}
      >
        {children}
      </body>
    </html>
  );
}
