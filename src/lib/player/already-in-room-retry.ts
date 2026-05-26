export interface AlreadyInRoomRetryInput {
  errorMessage: string | undefined;
  alreadyAttempted: boolean;
  blocked: boolean;
}

export interface AlreadyInRoomRetryDecision {
  shouldRetry: boolean;
  shouldSurfaceError: boolean;
}

export const ALREADY_IN_ROOM_ERROR = 'That player is already in the room';
export const ALREADY_IN_ROOM_RETRY_DELAY_MS = 800;

export function decideAlreadyInRoomRetry(input: AlreadyInRoomRetryInput): AlreadyInRoomRetryDecision {
  if (input.errorMessage !== ALREADY_IN_ROOM_ERROR) {
    return { shouldRetry: false, shouldSurfaceError: false };
  }
  if (input.blocked) {
    return { shouldRetry: false, shouldSurfaceError: true };
  }
  if (input.alreadyAttempted) {
    return { shouldRetry: false, shouldSurfaceError: true };
  }
  return { shouldRetry: true, shouldSurfaceError: false };
}
