"use client";

/**
 * Multi-select user picker — thin wrapper around UserSelect.
 *
 * Exposes a simpler API (`values` + `onChange(ids[])`) than UserSelect's
 * discriminated union. Used everywhere the call site picks multiple users.
 */

import { UserSelect, type PickerUser } from "./user-select";

interface Props {
  values: string[];
  onChange: (ids: string[]) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  chipLimit?: number;
  disabled?: boolean;
  /** Infinite-scroll + server-search (optional — see UserSelect). */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  /** Full objects of selected users, so chips persist across paginated slices. */
  selectedUsers?: PickerUser[];
}

export function UserMultiPicker({
  values, onChange, users, placeholder, error, chipLimit, disabled,
  onLoadMore, hasMore, loadingMore, onSearchChange, loading, selectedUsers,
}: Props) {
  return (
    <UserSelect
      mode="multi"
      values={values}
      onChange={onChange}
      users={users}
      placeholder={placeholder}
      error={error}
      chipLimit={chipLimit}
      disabled={disabled}
      onLoadMore={onLoadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onSearchChange={onSearchChange}
      loading={loading}
      selectedUsers={selectedUsers}
    />
  );
}
