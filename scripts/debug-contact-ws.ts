/** READ-ONLY: identify the workspace the contact actually landed in, and
 * confirm the creator is a member of Syntrofi so a move is valid. */
import { PrismaClient } from "@prisma/client";

const WRONG_WS = "cmjzyn3x2001prze7jjcsiemw";
const SYNTROFI = "cmk01wbrb000arzxzj8zy4czg";
const CREATOR = "cmdfuz6eu0000a08xmknsk4gc";
const EMAIL_HASH = "9241e870b5c55d8ae1e833202b5f064e9e32a7778f1b62b0c60326a25267a4c9";

const prisma = new PrismaClient();

async function main() {
  const wrong = await prisma.workspace.findUnique({
    where: { id: WRONG_WS },
    select: { id: true, name: true, slug: true, type: true },
  });
  console.log("Contact currently lives in workspace:", wrong);

  const creator = await prisma.user.findUnique({
    where: { id: CREATOR },
    select: { id: true, name: true, email: true },
  });
  console.log("Created by:", creator);

  const memberOfSyntrofi = await prisma.workspaceUser.findFirst({
    where: { workspaceId: SYNTROFI, userId: CREATOR },
    select: { role: true },
  });
  console.log("Creator's Syntrofi membership:", memberOfSyntrofi ?? "NOT A MEMBER");

  // emailHash is globally @unique — confirm nothing else holds it (only the
  // contact itself should), so moving it raises no constraint issue.
  const sameHash = await prisma.crmContact.findMany({
    where: { emailHash: EMAIL_HASH },
    select: { id: true, workspaceId: true, firstName: true, lastName: true },
  });
  console.log(`Contacts sharing this emailHash (${sameHash.length}):`, sameHash);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
