import { singleton } from "../../../helper/singleton.ts";
import { onCreate } from "./onCreate.ts";
import { onFollow } from "./onFollow.ts";
import { onUndo } from "./onUndo.ts";

export const InboxListener = {
  getInstance: singleton(() => ({
    onCreate,
    onFollow,
    onUndo,
  }))
} as const;
