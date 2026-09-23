import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    DATABASE_URL: z.string({
      error: "DATABASE_URL is required in environment variables",
    }),

    OPENAI_API_KEY: z.string({
      error: "OPENAI_API_KEY is required in environment variables",
    }),

    OPENAI_BASE_URL: z.string({
      error: "OPENAI_BASE_URL is required in environment variables",
    }),

    E2B_API_KEY: z.string({
      error: "E2B_API_KEY is required in environment variables",
    }),

    CODING_AGENT_MODEL: z.string({
      error: "CODING_AGENT_MODEL is required in environment variables",
    }),

    GENERATOR_MODEL: z.string({
      error: "GENERATOR_MODEL is required in environment variables",
    }),
  },
  experimental__runtimeEnv: process.env,
})
