"use client";

import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

export function IconButton({ icon: Icon, label, className = "", ...props }: Omit<ComponentProps<typeof Button>, "children"> & { icon: LucideIcon; label: string }) {
  return <Tooltip label={label}><Button {...props} className={`icon-button ${className}`} aria-label={label}><Icon size={14} aria-hidden="true" /></Button></Tooltip>;
}
