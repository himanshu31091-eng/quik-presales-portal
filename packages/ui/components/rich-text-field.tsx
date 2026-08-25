"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
} from "lucide-react";

export interface RichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Pixel min height for the editable area. Default 140. */
  minHeight?: number;
  disabled?: boolean;
}

export function RichTextField({
  value,
  onChange,
  placeholder = "Enter your content here...",
  minHeight = 140,
  disabled,
}: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none px-3 py-2 focus:outline-none text-sm text-gray-800",
        style: `min-height: ${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="w-full rounded-lg border border-gray-200 bg-gray-50"
        style={{ minHeight: minHeight + 48 }}
      />
    );
  }

  const btn = (active: boolean) =>
    `p-1.5 rounded text-xs ${
      active
        ? "bg-gray-200 text-gray-900"
        : "text-gray-600 hover:bg-gray-100"
    } disabled:opacity-30 disabled:cursor-not-allowed`;

  return (
    // focus-within ring on the wrapper: Tiptap owns the inner contenteditable's
    // class list (which sets focus:outline-none), so the visible focus indicator
    // has to live out here (WCAG 2.4.7).
    <div className="w-full rounded-lg border border-gray-200 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-accent-700">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive("heading", { level: 1 }))} title="Heading 1" disabled={disabled}>
          <Heading1 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="Heading 2" disabled={disabled}>
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="Bold" disabled={disabled}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="Italic" disabled={disabled}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} title="Underline" disabled={disabled}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} title="Strikethrough" disabled={disabled}>
          <Strikethrough className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="Bullet list" disabled={disabled}>
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="Numbered list" disabled={disabled}>
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} title="Quote" disabled={disabled}>
          <Quote className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive("code"))} title="Inline code" disabled={disabled}>
          <Code className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => { const url = window.prompt("URL?"); if (url) editor.chain().focus().setLink({ href: url }).run(); else editor.chain().focus().unsetLink().run(); }} className={btn(editor.isActive("link"))} title="Link" disabled={disabled}>
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-gray-300" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Undo" disabled={disabled || !editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Redo" disabled={disabled || !editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="bg-white" onClick={() => editor.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
