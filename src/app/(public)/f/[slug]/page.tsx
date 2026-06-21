import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { parseFormFields } from "~/server/services/forms/formSchema";
import { PublicForm } from "./_components/PublicForm";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await db.form.findFirst({ where: { slug, isActive: true } });
  if (!form) notFound();

  return (
    <PublicForm
      slug={form.slug}
      name={form.name}
      description={form.description}
      fields={parseFormFields(form.fields)}
      confirmationMessage={form.confirmationMessage}
    />
  );
}