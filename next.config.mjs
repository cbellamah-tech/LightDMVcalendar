/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    // Bundle CSV seed files (yard sign stops) as plain strings.
    config.module.rules.push({ test: /\.csv$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
