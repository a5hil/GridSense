import { getCurrentUser, ScadaUser } from "./auth";

/**
 * Validates that an incoming request is authenticated with an authorized Operator session.
 */
export async function assertOperatorSession(): Promise<{
  authorized: boolean;
  user: ScadaUser | null;
  error?: string;
  statusCode?: number;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      authorized: false,
      user: null,
      error: "UNAUTHORIZED: Active operator session required",
      statusCode: 401,
    };
  }

  if (user.role !== "OPERATOR" && user.role !== "ADMIN") {
    return {
      authorized: false,
      user,
      error: `FORBIDDEN: Role '${user.role}' is not authorized to execute grid control actions`,
      statusCode: 403,
    };
  }

  return { authorized: true, user };
}
