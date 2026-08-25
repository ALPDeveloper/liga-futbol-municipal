import { useId } from "react";

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PasswordField({
  autoComplete = "current-password",
  className = "",
  inputClassName = "",
  label = "Contraseña",
  minLength,
  name,
  onChange,
  placeholder = "",
  required = true,
  value,
  visible = false,
  onToggleVisibility
}) {
  const inputId = useId();
  const controlledProps = value === undefined ? {} : { value };

  return (
    <label className={`password-entry-field ${className}`.trim()} htmlFor={inputId}>
      {label}
      <span className="password-entry-shell">
        <input
          {...controlledProps}
          autoCapitalize="none"
          autoComplete={autoComplete}
          autoCorrect="off"
          className={`password-entry-input ${inputClassName}`.trim()}
          id={inputId}
          minLength={minLength}
          name={name}
          placeholder={placeholder}
          required={required}
          spellCheck="false"
          type={visible ? "text" : "password"}
          onChange={onChange}
        />
        <button
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="password-entry-toggle"
          type="button"
          onClick={onToggleVisibility}
        >
          <EyeIcon />
        </button>
      </span>
    </label>
  );
}
