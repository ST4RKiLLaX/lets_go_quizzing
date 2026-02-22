export function resolveHostCreatePassword(
  hostPasswordRequired: boolean,
  hostPassword: string
): string | undefined {
  if (!hostPasswordRequired) return undefined;
  const typedPassword = hostPassword.trim();
  return typedPassword || undefined;
}

export function mapHostCreateError(error?: string): {
  clearAuthenticated: boolean;
  message: string;
} {
  if (error === 'Invalid password') {
    return {
      clearAuthenticated: true,
      message: 'Session expired. Enter host password again.',
    };
  }
  return {
    clearAuthenticated: false,
    message: error ?? 'Failed to create room',
  };
}
