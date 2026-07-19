/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  },
}

module.exports = nextConfig