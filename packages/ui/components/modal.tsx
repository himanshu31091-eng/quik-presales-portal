"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

const Modal = ({
  open,
  onOpenChange,
  children,
  className,
}: ModalProps) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "fixed inset-0 z-modal-backdrop bg-black bg-opacity-50 dark:bg-opacity-60",
            // The backdrop both centres the panel and scrolls it. Centring lives
            // here rather than on the panel because the panel is transform-
            // animated — see the note below. Scrolling lives here because this
            // component sets `body { overflow: hidden }`, so a panel taller than
            // the viewport would otherwise have no way to be reached at all.
            "flex overflow-y-auto p-4"
          )}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              // `m-auto` inside a flex parent, NOT `top-1/2 left-1/2` with
              // `-translate-*`. Framer Motion owns the inline `transform` on this
              // element for the scale animation, and writes `transform: none`
              // once it settles at scale 1 — which silently destroyed Tailwind's
              // translate-based centring. The panel's top-left corner ended up at
              // the viewport centre, pushing a tall modal off the bottom of the
              // screen with its buttons unreachable.
              //
              // `m-auto` also survives overflow correctly, where `items-center`
              // on the parent would clip the top of an over-tall panel.
              "m-auto z-modal w-full max-w-md",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ModalContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ModalContent = React.forwardRef<HTMLDivElement, ModalContentProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-white dark:bg-neutral-800 rounded-lg shadow-xl overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);

ModalContent.displayName = "ModalContent";

interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
}

const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ className, onClose, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between p-6 border-b border-border dark:border-neutral-700",
        className
      )}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5 text-text-secondary" />
        </button>
      )}
    </div>
  )
);

ModalHeader.displayName = "ModalHeader";

interface ModalTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const ModalTitle = React.forwardRef<HTMLHeadingElement, ModalTitleProps>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-xl font-bold text-text-primary", className)}
      {...props}
    />
  )
);

ModalTitle.displayName = "ModalTitle";

interface ModalDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const ModalDescription = React.forwardRef<HTMLParagraphElement, ModalDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-text-secondary mt-1", className)}
      {...props}
    />
  )
);

ModalDescription.displayName = "ModalDescription";

interface ModalBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalBody = React.forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 space-y-4", className)} {...props} />
  )
);

ModalBody.displayName = "ModalBody";

interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex gap-3 justify-end p-6 border-t border-border dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900",
        className
      )}
      {...props}
    />
  )
);

ModalFooter.displayName = "ModalFooter";

export {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
};
