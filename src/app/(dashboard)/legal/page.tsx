import { redirect } from "next/navigation";

/*
 * Terms and privacy moved.
 *
 * They are edited on the Website screen now, beside the pictures that go
 * on the same public site — one job, one place. This stays so that a
 * bookmark, or a link in an old email, still lands somewhere useful
 * rather than on a 404.
 */
export default function LegalRedirect() {
  redirect("/media");
}
