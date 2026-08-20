import type { ReactNode } from "react"

export function Page({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-xl">
        <h1 className="text-title1 font-semibold tracking-tight outline-none" tabIndex={-1}>
          {title}
        </h1>
        {children}
      </div>
    </section>
  )
}
