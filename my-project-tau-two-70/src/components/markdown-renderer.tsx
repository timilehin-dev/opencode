"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ---------------------------------------------------------------------------
// Styled Markdown Renderer for Klawhub Chat
// ---------------------------------------------------------------------------
// Renders markdown with: tables, code blocks, headers, bold, italic, lists,
// blockquotes, links, and LaTeX math ($...$ and $$...$$)
// ---------------------------------------------------------------------------

// Custom components for dark-themed chat bubbles
const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-foreground mt-3 mb-1.5">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground mt-2.5 mb-1">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h4>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
  ),

  // Bold and italic
  strong: ({ children }) => (
    <strong className="font-bold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-foreground/90">{children}</em>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="text-sm list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-sm list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),

  // Horizontal rule
  hr: () => (
    <hr className="my-3 border-border/50" />
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-400/50 pl-3 my-2 text-foreground/80 italic">
      {children}
    </blockquote>
  ),

  // Inline code
  code: ({ className, children, ...props }) => {
    // Detect if it's a code block (has className) or inline code
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      // This is handled by the pre component
      return <code className={className} {...props}>{children}</code>;
    }
    // Inline code
    return (
      <code className="bg-foreground/10 px-1.5 py-0.5 rounded text-xs font-mono text-foreground/90">
        {children}
      </code>
    );
  },

  // Code blocks
  pre: ({ children }) => (
    <pre className="bg-foreground/5 border border-border/50 rounded-lg p-3 my-2 overflow-x-auto custom-scrollbar">
      <code className="text-xs font-mono text-foreground/90 leading-relaxed">{children}</code>
    </pre>
  ),

  // Tables — properly styled
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-foreground/5">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border/50 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-foreground/80 border-b border-border/30 whitespace-nowrap">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-foreground/3 transition-colors">{children}</tr>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y-0">{children}</tbody>
  ),

  // Images
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ""} className="max-w-full rounded-lg my-2" />
  ),
};

// ---------------------------------------------------------------------------
// MarkdownRenderer Component
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
