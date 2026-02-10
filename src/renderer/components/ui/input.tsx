import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2",
                    "text-sm text-text-primary font-medium",
                    "placeholder:text-text-tertiary",
                    "transition-all duration-200 ease-smooth",
                    "hover:border-white/[0.12]",
                    "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/30 focus:bg-white/[0.08]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
