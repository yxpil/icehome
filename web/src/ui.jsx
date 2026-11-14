import { createContext, createElement, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';

export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Button({ variant = 'solid', size, className, icon, children, ...props }) {
  const variantClass = {
    solid: 'btn-solid',
    outline: 'btn-outline',
    ghost: 'btn-ghost',
    danger: 'btn-danger'
  }[variant];
  return createElement(
    'button',
    { type: 'button', className: cn('btn', variantClass, size === 'sm' && 'btn-sm', className), ...props },
    icon ? createElement(Icon, { name: icon, size: size === 'sm' ? 14 : 15 }) : null,
    children
  );
}

export function IconButton({ icon, label, className, size = 16, ...props }) {
  return createElement(
    'button',
    { type: 'button', title: label, 'aria-label': label, className: cn('btn-icon', className), ...props },
    createElement(Icon, { name: icon, size })
  );
}

export function Card({ className, children, ...props }) {
  return createElement('div', { className: cn('card', className), ...props }, children);
}

export function Switch({ checked, onChange, disabled, label }) {
  return createElement(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': Boolean(checked),
      'aria-label': label || '开关',
      disabled,
      onClick: (event) => {
        event.stopPropagation();
        onChange?.(!checked);
      },
      className: cn(
        'relative h-[22px] w-[40px] shrink-0 rounded-full border transition-colors duration-200',
        checked ? 'border-ink bg-ink' : 'border-line bg-mist',
        disabled && 'opacity-40 pointer-events-none'
      )
    },
    createElement('span', {
      className: cn(
        'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-paper transition-all duration-200',
        checked ? 'left-[21px]' : 'left-[2px]'
      )
    })
  );
}

export function Badge({ children, tone = 'line', className }) {
  const toneClass = {
    line: 'border-line text-muted2',
    ink: 'border-ink bg-ink text-white',
    soft: 'border-line bg-mist text-ink',
    warn: 'border-ink text-ink'
  }[tone];
  return createElement(
    'span',
    { className: cn('inline-flex items-center gap-1 rounded-md border px-2 py-[3px] text-[11px] leading-4', toneClass, className) },
    children
  );
}

export function Dot({ online = true, className }) {
  return createElement('span', {
    className: cn(
      'inline-block h-[6px] w-[6px] rounded-full',
      online ? 'bg-ink' : 'bg-line',
      className
    )
  });
}

export function Field({ label, hint, error, htmlFor, className, children }) {
  return createElement(
    'div',
    { className: cn('flex flex-col gap-1.5', className) },
    label
      ? createElement(
          'label',
          { htmlFor, className: 'label' },
          label,
          hint ? createElement('span', { className: 'ml-2 normal-case tracking-normal text-[11px] text-muted2/80' }, hint) : null
        )
      : null,
    children,
    error ? createElement('span', { className: 'text-[11px] text-ink' }, `! ${error}`) : null
  );
}

export function Meter({ value = 0, max = 100, className }) {
  const ratio = Math.max(0, Math.min(1, Number(value) / Number(max || 1)));
  return createElement(
    'div',
    { className: cn('h-[3px] w-full overflow-hidden rounded-full bg-line2', className) },
    createElement('div', { className: 'h-full bg-ink transition-all duration-500', style: { width: `${ratio * 100}%` } })
  );
}

export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-xl' }) {
  if (!open) return null;
  return createPortal(
    createElement(
      'div',
      { className: 'fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6' },
      createElement('div', { className: 'absolute inset-0 bg-ink/25 backdrop-blur-[2px]', onClick: onClose }),
      createElement(
        'div',
        {
          className: cn(
            'relative w-full bg-paper border border-line shadow-pop animate-fadeUp',
            'rounded-t-2xl sm:rounded-xl max-h-[92vh] overflow-hidden flex flex-col',
            width
          ),
          role: 'dialog',
          'aria-modal': 'true'
        },
        createElement(
          'div',
          { className: 'flex items-start justify-between gap-4 border-b border-line px-5 py-4' },
          createElement(
            'div',
            { className: 'min-w-0' },
            createElement('h3', { className: 'text-[15px] font-semibold tracking-tight' }, title),
            description ? createElement('p', { className: 'muted mt-0.5' }, description) : null
          ),
          createElement(IconButton, { icon: 'close', label: '关闭', onClick: onClose })
        ),
        createElement('div', { className: 'overflow-y-auto px-5 py-4' }, children),
        footer ? createElement('div', { className: 'border-t border-line px-5 py-3 flex items-center justify-end gap-2' }, footer) : null
      )
    ),
    document.body
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }) {
  if (!open) return null;
  return createPortal(
    createElement(
      'div',
      { className: 'fixed inset-0 z-50 flex justify-end' },
      createElement('div', { className: 'absolute inset-0 bg-ink/20 backdrop-blur-[1px]', onClick: onClose }),
      createElement(
        'aside',
        {
          className:
            'relative h-full w-full sm:w-[440px] bg-paper border-l border-line flex flex-col animate-fadeUp'
        },
        createElement(
          'div',
          { className: 'flex items-start justify-between gap-4 border-b border-line px-5 py-4' },
          createElement(
            'div',
            { className: 'min-w-0' },
            createElement('div', { className: 'text-micro uppercase text-muted2' }, subtitle || '设备详情'),
            createElement('h3', { className: 'text-[17px] font-semibold tracking-tight mt-0.5 truncate' }, title)
          ),
          createElement(IconButton, { icon: 'close', label: '关闭', onClick: onClose })
        ),
        createElement('div', { className: 'flex-1 overflow-y-auto px-5 py-4' }, children),
        footer ? createElement('div', { className: 'border-t border-line px-5 py-3' }, footer) : null
      )
    ),
    document.body
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return createElement(
    'div',
    { className: cn('flex items-center gap-1 rounded-lg border border-line p-1', className) },
    tabs.map((tab) =>
      createElement(
        'button',
        {
          key: tab.value,
          type: 'button',
          onClick: () => onChange(tab.value),
          className: cn(
            'flex-1 rounded-md px-3 py-1.5 text-[12px] transition-colors',
            value === tab.value ? 'bg-ink text-white' : 'text-muted2 hover:text-ink'
          )
        },
        tab.label,
        tab.count !== undefined ? createElement('span', { className: 'ml-1.5 num opacity-60' }, tab.count) : null
      )
    )
  );
}

export function EmptyState({ icon = 'cube', title, description, action }) {
  return createElement(
    'div',
    { className: 'flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center' },
    createElement('div', { className: 'mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted2' },
      createElement(Icon, { name: icon, size: 18 })
    ),
    createElement('p', { className: 'text-[13.5px] font-medium' }, title),
    description ? createElement('p', { className: 'muted mt-1 max-w-sm' }, description) : null,
    action ? createElement('div', { className: 'mt-4' }, action) : null
  );
}

export function SectionHeader({ title, description, action, className }) {
  return createElement(
    'div',
    { className: cn('flex flex-wrap items-end justify-between gap-3', className) },
    createElement(
      'div',
      { className: 'min-w-0' },
      createElement('h2', { className: 'text-[13px] font-semibold tracking-tight' }, title),
      description ? createElement('p', { className: 'muted mt-0.5' }, description) : null
    ),
    action
  );
}

export function CopyButton({ text, label = '复制', className }) {
  const toast = useToast();
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板', 'success');
    } catch {
      toast('复制失败，请手动选择文本', 'warn');
    }
  }, [text, toast]);
  return createElement(Button, { variant: 'outline', size: 'sm', icon: 'copy', onClick: copy, className }, label);
}

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setItems((current) => [...current, { key, message, tone }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.key !== key));
    }, 2800);
  }, []);
  return createElement(
    ToastContext.Provider,
    { value: push },
    children,
    createElement(
      'div',
      { className: 'pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2' },
      items.map((item) =>
        createElement(
          'div',
          {
            key: item.key,
            className:
              'animate-fadeUp rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[12.5px] shadow-pop flex items-center gap-2'
          },
          createElement(Icon, {
            name: item.tone === 'warn' ? 'alert' : item.tone === 'success' ? 'check' : 'sparkle',
            size: 15
          }),
          createElement('span', { className: 'min-w-0 flex-1' }, item.message)
        )
      )
    )
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Spinner({ label }) {
  return createElement(
    'div',
    { className: 'flex items-center gap-2 text-[12px] text-muted2' },
    createElement('span', { className: 'h-3 w-3 animate-spin rounded-full border border-line border-t-ink' }),
    label || null
  );
}
