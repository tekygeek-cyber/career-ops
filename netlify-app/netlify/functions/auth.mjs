import { json } from "../lib/security.mjs";
export default async function handler() {
  return json(
    {
      error:
        "Hosted Google sign-in is disabled. Use the local workspace for opt-in email metadata.",
    },
    410,
  );
}
