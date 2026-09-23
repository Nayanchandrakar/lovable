import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Hint } from "@/components/ui/hint"
import type { Fragment } from "@/generated/prisma"

type FragmentWebProps = {
  data: Fragment
}

export const FragmentWeb = ({ data }: FragmentWebProps) => {
  const [fragmentKey, setFragmentKey] = useState(0)
  const [copied, setCopied] = useState(false)

  const onRefresh = () => {
    setFragmentKey((prev) => prev + 1)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(data.sandboxUrl!)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col size-full">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom" align="start">
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCcwIcon />
          </Button>
        </Hint>

        <Hint text="Click to copy" side="bottom">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="flex-1 justify-start text-start font-normal"
            disabled={!data.sandboxUrl || copied}
          >
            <span className="truncate">{data?.sandboxUrl}</span>
          </Button>
        </Hint>

        <Hint text="Open in a new tab" side="bottom" align="start">
          <Button
            size="sm"
            disabled={!data.sandboxUrl}
            variant="outline"
            onClick={() => {
              if (!data.sandboxUrl) return
              window.open(data.sandboxUrl, "_blank")
            }}
          >
            <ExternalLinkIcon />
          </Button>
        </Hint>
      </div>
      <iframe
        key={fragmentKey}
        className="h-full w-full"
        sandbox="allow-form allow-scripts allow-same-origin"
        loading="lazy"
        src={data.sandboxUrl!}
        title="alpha-iframe"
      />
    </div>
  )
}
