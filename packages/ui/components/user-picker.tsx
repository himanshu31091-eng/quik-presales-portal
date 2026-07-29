"use client";

/**
 * Single-select user picker — thin wrapper around UserSelect.
 *
 * Exposes a simpler API (`value` + `onChange`) than UserSelect's discriminated
 * union. Most call sites that pick one user prefer this shape.
 */

import { UserSelect, type PickerUser } from "./user-select";

export type { PickerUser };

interface Props {
  value: string;
  onChange: (id: string) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  /** Infinite-scroll + server-search (optional — see UserSelect). */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  /** Full object of the selected user, so its label persists across paginated slices. */
  selectedUsers?: PickerUser[];
}

export function UserPicker({
  value, onChange, users, placeholder, error, disabled,
  onLoadMore, hasMore, loadingMore, onSearchChange, loading, selectedUsers,
}: Props) {
  return (
    <UserSelect
      mode="single"
      value={value}
      onChange={onChange}
      users={users}
      placeholder={placeholder}
      error={error}
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
