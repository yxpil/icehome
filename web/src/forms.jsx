import { Icon, ICON_NAMES } from './icons.jsx';
import { Field, Switch, cn } from './ui.jsx';

function Control({ field, value, onChange, options }) {
  const common = { id: field.key, className: 'input' };
  if (field.type === 'select') {
    return (
      <select id={field.key} className="select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {(field.options || []).map((option) => (
          <option key={option.value ?? option} value={option.value ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'device') {
    return (
      <select id={field.key} className="select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择设备</option>
        {(options.devices || []).map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'category') {
    return (
      <select id={field.key} className="select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">未分类</option>
        {(options.categories || []).map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'textarea' || field.type === 'json') {
    return (
      <textarea
        id={field.key}
        rows={field.rows || 4}
        className="textarea"
        placeholder={field.placeholder}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        {...common}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step || 1}
        placeholder={field.placeholder}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === 'time') {
    return (
      <input
        {...common}
        type="time"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === 'toggle') {
    return (
      <div className="flex items-center gap-3 pt-1">
        <Switch checked={Boolean(value)} onChange={onChange} label={field.label} />
        <span className="muted">{value ? field.onLabel || '已启用' : field.offLabel || '已停用'}</span>
      </div>
    );
  }
  if (field.type === 'scopes') {
    const list = field.options || ['device:read', 'device:write', 'ai:use', 'admin'];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-2">
        {list.map((scope) => {
          const active = selected.includes(scope);
          return (
            <button
              key={scope}
              type="button"
              onClick={() => onChange(active ? selected.filter((item) => item !== scope) : [...selected, scope])}
              className={cn('chip transition-colors', active && 'chip-active')}
            >
              {active ? <Icon name="check" size={11} /> : null}
              {scope}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === 'icon') {
    return (
      <div className="grid grid-cols-8 gap-1.5 rounded-lg border border-line p-2">
        {ICON_NAMES.slice(0, 40).map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            className={cn(
              'flex h-8 items-center justify-center rounded-md border transition-colors',
              value === name ? 'border-ink bg-ink text-white' : 'border-transparent text-muted2 hover:bg-mist hover:text-ink'
            )}
          >
            <Icon name={name} size={15} />
          </button>
        ))}
      </div>
    );
  }
  if (field.type === 'capabilities') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {(options.capabilities || []).map((cap) => {
          const active = selected.includes(cap.key);
          return (
            <button
              key={cap.key}
              type="button"
              title={`${cap.type === 'number' ? `${cap.min}-${cap.max}${cap.unit || ''}` : cap.values?.join(' / ') || '布尔'}`}
              onClick={() => onChange(active ? selected.filter((item) => item !== cap.key) : [...selected, cap.key])}
              className={cn('chip transition-colors', active && 'chip-active')}
            >
              {active ? <Icon name="check" size={11} /> : null}
              {cap.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <input
      {...common}
      type={field.type === 'password' ? 'password' : 'text'}
      placeholder={field.placeholder}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function EntityForm({ fields, value, onChange, options = {}, errors = {} }) {
  return (
    <div className="flex flex-col gap-3.5">
      {fields.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint} htmlFor={field.key} error={errors[field.key]}>
          <Control
            field={field}
            value={value[field.key]}
            onChange={(next) => onChange({ ...value, [field.key]: next })}
            options={options}
          />
        </Field>
      ))}
    </div>
  );
}
