import { FranchiseClient } from "@/components/franchise-client";

export default async function FranchisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FranchiseClient slug={slug} />;
}
