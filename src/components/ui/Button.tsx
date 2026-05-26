import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'vng-tui-btn',
  secondary: 'vng-tui-btn',
  ghost: 'vng-tui-btn vng-tui-btn--ghost',
  danger: 'vng-tui-btn',
}

const sizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
  const labelText = label ? `${label.toUpperCase()}:` : null
  return (
    <label className="vng-tui-field" htmlFor={inputId}>
      {labelText && <span className="vng-tui-field__label">{labelText}</span>}
      <div className="vng-tui-field__row">
        <input id={inputId} className={`vng-tui-input ${className}`} {...props} />
      </div>
    </label>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className = '', id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-')
  const labelText = label ? `${label.toUpperCase()}:` : null
  return (
    <label className="vng-tui-field" htmlFor={inputId}>
      {labelText && <span className="vng-tui-field__label">{labelText}</span>}
      <div className="vng-tui-field__row vng-tui-field__row--area">
        <textarea id={inputId} className={`vng-tui-textarea ${className}`} {...props} />
      </div>
    </label>
  )
}
