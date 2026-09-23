"use client"

import { UserButton } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useCurrentTheme } from "@/hooks/use-current-theme"

type Props = {
  showName?: boolean
}

export const UserControl = ({ showName }: Props) => {
  const currentTheme = useCurrentTheme()

  return (
    <UserButton
      showName={showName!}
      appearance={{
        elements: {
          userButtonBox: "rounded-md!",
          userButtonAvatarBox: "rounded-md! size-8!",
          userButtonTrigger: "rounded-md!",
        },
        ...(currentTheme === "dark" ? { baseTheme: dark } : {}),
      }}
    />
  )
}
