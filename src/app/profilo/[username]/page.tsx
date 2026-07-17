import { ProfileClient } from "@/components/profile-client";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileClient username={username} />;
}
