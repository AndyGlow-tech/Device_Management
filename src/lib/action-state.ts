export type ActionResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" }
  | { status: "conflict"; message: string; conflictingDeviceId: string };

export const initialActionState: ActionResult = { status: "idle" };
