import type { ButtonHTMLAttributes } from "react";

export function Button({ variant = "secondary", className = "", type = "button", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button type={type} className={`ui-button ui-button-${variant} ${className}`} {...props} />;
}
