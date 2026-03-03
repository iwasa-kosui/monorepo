import type { ComponentPropsWithoutRef } from "react";

export const mdxComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mt-8 mb-4 text-3xl font-bold" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-6 mb-3 text-2xl font-semibold" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-5 mb-2 text-xl font-semibold" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="my-4 leading-7" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-primary underline underline-offset-4 hover:opacity-80" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-4 ml-6 list-disc space-y-2" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-4 ml-6 list-decimal space-y-2" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-7" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="my-4 border-l-4 border-primary pl-4 italic text-muted-foreground" {...props} />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-4 overflow-x-auto rounded-lg p-4" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props} />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-8 border-border" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="border border-border bg-muted px-4 py-2 text-left font-semibold" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border border-border px-4 py-2" {...props} />
  ),
};
