import "./globals.css";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Data Manager - Universal Multi-Database Transfer & Backup",
  description:
    "Enterprise data migration, snapshot backups, and management across PostgreSQL, MySQL, SQL Server, DynamoDB, and MongoDB. Developed by Krashang Kumar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
