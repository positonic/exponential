import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { MenuSettings } from "~/app/_components/welcome/MenuSettings";

export const metadata = { title: "Your menu" };

/**
 * The menu picker on its own. Unlike `/welcome` this never redirects a person
 * who has finished the welcome flow: it is the way back to the one part of it
 * worth revisiting.
 */
export default async function WelcomeMenuPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return <MenuSettings />;
}
