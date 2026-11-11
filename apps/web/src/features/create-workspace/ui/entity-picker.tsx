"use client";

import { useMemo, useState } from "react";
import { classNames } from "@/shared/lib";
import styles from "./entity-picker.module.scss";

export interface EntityPickerOption {
  id: string;
  name: string;
}

export interface EntityPickerProps {
  label: string;
  options: EntityPickerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
}

/**
 * Searchable optional entity picker (Make CreateProjectDialog Picker).
 */
export function EntityPicker({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
}: EntityPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label} <span className={styles.optional}>· необязательно</span>
      </label>
      {selected ? (
        <div className={styles.picked}>
          <span>{selected.name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setQuery("");
            }}
          >
            Сбросить
          </button>
        </div>
      ) : (
        <div className={styles.picker}>
          <input
            className={styles.control}
            value={query}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={label}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
          {open ? (
            <div className={styles.list} role="listbox">
              {list.length === 0 ? (
                <p className={styles.empty}>Ничего не найдено</p>
              ) : null}
              {list.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={classNames(styles.option)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {o.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
