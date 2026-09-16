/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "pg",
    "mysql2",
    "mssql",
    "mongodb",
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "tedious",
  ],
};

export default nextConfig;
