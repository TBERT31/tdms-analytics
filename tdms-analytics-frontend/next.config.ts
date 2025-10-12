import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3001',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,DELETE,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, Content-Type, Authorization, Cookie',
          },
        ],
      },
    ];
  },
  
  async rewrites() {
    return [
      {
        source: '/api/gateway/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3001'}/:path*`,
      },
    ];
  },
};

export default nextConfig;