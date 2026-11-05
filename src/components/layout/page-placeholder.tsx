type PagePlaceholderProps = {
  title: string
  description: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>

      <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-slate-900 p-10 text-center">
        <p className="text-sm text-slate-400">This module is under construction.</p>
      </div>
    </section>
  )
}
