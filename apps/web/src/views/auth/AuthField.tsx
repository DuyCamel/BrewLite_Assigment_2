// TV3 — Ô nhập có nhãn, gợi ý và thông báo lỗi gắn đúng bằng aria để trình đọc màn hình đọc được.
import styles from "./auth.module.css";
interface AuthFieldProps {
  id: string;
  name: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
}
export function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  disabled,
}: AuthFieldProps) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${styles.input} ${error ? styles.inputInvalid : ""}`}
      />
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
