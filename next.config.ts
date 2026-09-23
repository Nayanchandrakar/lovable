import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/instrumentation-winston",
  ],
}

export default nextConfig
