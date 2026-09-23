import { Inngest } from "inngest"

export const inngest = new Inngest({
  id: "lovable-clone",
  isDev: process.env.NODE_ENV !== "production",
})
