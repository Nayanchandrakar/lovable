"use client"

import { SignUp } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useCurrentTheme } from "@/hooks/use-current-theme"

export default function SignUpPage() {
  const currentTheme = useCurrentTheme()
  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <section className="space-y-6 pt-[16vh] 2xl:pt-48">
        <div className="flex flex-col items-center">
          <SignUp
            appearance={{
              ...(currentTheme === "dark" ? { baseTheme: dark } : {}),
              elements: {
                cardBox: "border! shadow-none! rounded-lg!",
              },
            }}
          />
        </div>
      </section>
    </div>
  )
}
