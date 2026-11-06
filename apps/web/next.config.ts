import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
const nextConfig: NextConfig = { poweredByHeader: false };
export default nextConfig;
