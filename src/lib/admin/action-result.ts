export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: string[];
}

/** Turns a Supabase/Postgres error into a message an admin can act on. */
export function friendlyDbError(error: { message: string; code?: string } | null | undefined): string {
  if (!error) return "Something went wrong.";
  if (error.code === "23505") return "That already exists.";
  if (error.code === "23503") return "It's still in use, or refers to something that no longer exists.";
  if (error.code === "42501")
    return error.message.includes("row-level security")
      ? "You don't have permission to do that."
      : error.message;
  return error.message;
}
